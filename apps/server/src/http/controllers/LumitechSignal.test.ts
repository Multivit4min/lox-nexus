import assert from "node:assert/strict"
import path from "node:path"
import { test } from "node:test"
import type { LoxoneSignalDto, MiniserverDto } from "@lox-nexus/api"
import { TestApp } from "../../test-support/TestApp.ts"

test("a Lumitech signal is stored, survives a restart and an export, and is refused where it can't work", async t => {
  const databaseFile = path.join(TestApp.tempDir(), "nexus.db")
  const first = await TestApp.start({ databaseFile })
  t.after(() => first.dispose())
  const admin = await first.admin()
  const ms = (await admin.post("/api/miniservers", {
    slug: "haus", label: "Haus", host: "127.0.0.1", port: 7000, listenPort: 7001, ownId: "nexus", remoteId: "ms", enabled: false
  })).json<MiniserverDto>()
  const url = `/api/miniservers/${ms.id}/signals`
  const created = await admin.post(url, { packetId: "lcana", direction: "in", dataType: 1, label: "Light", lumitech: true })
  assert.equal(created.statusCode, 201, created.body)
  assert.deepEqual([created.json<LoxoneSignalDto>().lumitech, created.json<LoxoneSignalDto>().valueType], [true, "any"])
  const refused = await admin.post(url, { packetId: "x", direction: "out", dataType: 4, label: "X", lumitech: true })
  assert.equal(refused.statusCode, 400, refused.body)
  assert.match(refused.body, /only for Analog signals and RGBW inputs/)
  const exported = (await admin.get("/api/config/export")).json<{ miniservers: Array<{ signals: Array<{ lumitech?: boolean }> }> }>()
  assert.equal(exported.miniservers[0]?.signals[0]?.lumitech, true)
  await first.dispose()

  const second = await TestApp.start({ databaseFile })
  t.after(() => second.dispose())
  const signals = (await (await second.login()).get(url)).json<LoxoneSignalDto[]>()
  assert.deepEqual(signals.map(s => [s.packetId, s.lumitech, s.valueType]), [["lcana", true, "any"]])
})
