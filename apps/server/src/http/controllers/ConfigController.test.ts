import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import type { ConfigExport, ConfigImportResultDto, LoxoneSignalDto, MiniserverDto, WireDto } from "@lox-nexus/api"
import type { ApiClient } from "../../test-support/ApiClient.ts"
import { TestApp } from "../../test-support/TestApp.ts"

/** what an installation looks like over the API, without runtime fields */
const snapshot = async (client: ApiClient) => {
  const miniservers = (await client.get("/api/miniservers")).json<MiniserverDto[]>()
  return {
    miniservers: await Promise.all(miniservers.map(async ms => ({
      id: ms.id, slug: ms.slug, hasPassword: ms.hasPassword,
      signals: (await client.get(`/api/miniservers/${ms.id}/signals`)).json<LoxoneSignalDto[]>().map(s => [s.id, s.topic])
    }))),
    wires: (await client.get("/api/wires")).json<WireDto[]>().map(w => [w.id, w.sourceId, w.targetId, w.active, w.transforms])
  }
}

describe("config export and import", { timeout: 10_000 }, () => {
  let source: TestApp
  let admin: ApiClient
  let exported: ConfigExport

  before(async () => {
    source = await TestApp.start()
    admin = await source.admin()
    const ms = (await admin.post("/api/miniservers", {
      slug: "haus", label: "Haus", host: "127.0.0.1", port: 7777, listenPort: 7000, ownId: "nexus", remoteId: "ms", password: "secret", enabled: false
    })).json<MiniserverDto>()
    const base = `/api/miniservers/${ms.id}/signals`
    const level = (await admin.post(base, { packetId: "level", direction: "in", dataType: 1, label: "Level" })).json<LoxoneSignalDto>()
    const pump = (await admin.post(base, { packetId: "pump", direction: "out", dataType: 1, label: "Pump", slug: "main-pump" })).json<LoxoneSignalDto>()
    await admin.post("/api/wires", { label: "level to pump", sourceId: level.id, targetId: pump.id, transforms: [{ op: "scale", from: [0, 100], to: [0, 255] }] })
    assert.equal((await admin.get("/api/wires")).json<WireDto[]>().length, 1)
  })
  after(() => source.dispose())

  test("the export is a download with ids, signals and wires, and no password", async () => {
    const response = await admin.get("/api/config/export")
    assert.equal(response.statusCode, 200)
    assert.match(String(response.headers["content-disposition"]), /attachment; filename="lox-nexus-config-\d{4}-\d{2}-\d{2}\.json"/)
    exported = response.json<ConfigExport>()
    assert.deepEqual([exported.format, exported.version, exported.miniservers.length, exported.wires.length], ["lox-nexus/config", 2, 1, 1])
    assert.equal(exported.miniservers[0]!.signals.length, 2)
    assert.doesNotMatch(response.body, /secret|password/)
  })

  test("importing into another installation recreates the same configuration", async () => {
    const target = await TestApp.start()
    try {
      const other = await target.admin()
      await other.post("/api/miniservers", { slug: "alt", label: "Alt", host: "h", port: 1, listenPort: 2, ownId: "a", remoteId: "b", enabled: false })
      const response = await other.post("/api/config/import", exported)
      assert.equal(response.statusCode, 200, response.body)
      assert.deepEqual(response.json<ConfigImportResultDto>(), { miniservers: 1, signals: 2, wires: 1, inactiveWires: 0, keptPasswords: [], plugins: 0, pluginSignals: 0, missingSecrets: [] })
      const expected = await snapshot(admin)
      assert.deepEqual(await snapshot(other), { ...expected, miniservers: expected.miniservers.map(ms => ({ ...ms, hasPassword: false })) })
    } finally {
      await target.dispose()
    }
  })

  test("importing into the same installation keeps the stored password", async () => {
    const response = await admin.post("/api/config/import", exported)
    assert.equal(response.statusCode, 200, response.body)
    assert.deepEqual(response.json<ConfigImportResultDto>().keptPasswords, [exported.miniservers[0]!.id])
    assert.equal((await snapshot(admin)).miniservers[0]!.hasPassword, true)
  })

  test("a wire that can't run is imported as inactive, as it was exported", async () => {
    const future = { ...exported, wires: [{ ...exported.wires[0]!, transforms: [{ op: "from-a-newer-version" }] }] }
    const response = await admin.post("/api/config/import", future)
    assert.equal(response.statusCode, 200, response.body)
    assert.deepEqual([response.json<ConfigImportResultDto>().wires, response.json<ConfigImportResultDto>().inactiveWires], [1, 1])
    assert.deepEqual((await admin.get("/api/wires")).json<WireDto[]>().map(w => [w.active, w.transforms]), [[false, [{ op: "unsupported", raw: { op: "from-a-newer-version" } }]]])
    assert.equal((await admin.post("/api/config/import", exported)).statusCode, 200)
  })

  test("a file that isn't consistent is refused before anything changes", async () => {
    const before = await snapshot(admin)
    const dangling = { ...exported, wires: [{ ...exported.wires[0]!, sourceId: "missing" }] }
    const response = await admin.post("/api/config/import", dangling)
    assert.equal(response.statusCode, 400)
    assert.match(response.json<{ error: string }>().error, /wires\[0\]: signal "missing" is not in the file/)
    assert.equal((await admin.post("/api/config/import", { format: "something else" })).statusCode, 400)
    assert.deepEqual(await snapshot(admin), before)
  })

  test("a step that fails restores the previous configuration", async () => {
    const before = await snapshot(admin)
    const ms = exported.miniservers[0]!
    const clash = { ...ms, signals: [...ms.signals, { ...ms.signals[0]!, id: "copy", slug: "copy" }] }
    const response = await admin.post("/api/config/import", { ...exported, miniservers: [clash] })
    assert.equal(response.statusCode, 409)
    assert.match(response.json<{ error: string }>().error, /^miniservers\[0\]\.signals\[2\]: packet id "level" already has an in signal/)
    assert.deepEqual(await snapshot(admin), before)
  })
})
