import assert from "node:assert/strict"
import path from "node:path"
import { describe, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { TestApp } from "./test-support/TestApp.ts"

describe("NexusApp", { timeout: 10_000 }, () => {
  test("starts, answers health checks without a session, and disposes", async () => {
    const test = await TestApp.start()
    assert.match(test.address, /^http:\/\/127\.0\.0\.1:\d+$/)
    assert.equal((await test.client().get("/api/health")).statusCode, 200)
    await test.dispose()
    assert.equal(test.app.isDisposed, true)
  })

  test("config, signals, wires, forces and values survive a restart", async () => {
    const databaseFile = path.join(TestApp.tempDir(), "nexus.db")
    const first = await TestApp.start({ databaseFile })
    const admin = await first.admin()
    const ms = (await admin.post("/api/miniservers", {
      slug: "haus", label: "Haus", host: "127.0.0.1", port: 7000, listenPort: 7001, ownId: "nexus", remoteId: "ms", enabled: false
    })).json<{ id: string }>()
    const input = (await admin.post(`/api/miniservers/${ms.id}/signals`, { packetId: "a", direction: "in", dataType: 1, label: "A" })).json<{ id: string }>()
    const output = (await admin.post(`/api/miniservers/${ms.id}/signals`, { packetId: "b", direction: "out", dataType: 1, label: "B" })).json<{ id: string }>()
    assert.equal((await admin.post("/api/wires", { label: "a to b", sourceId: input.id, targetId: output.id })).statusCode, 201)
    first.app.bus.publish("loxone/haus/in/a", Value.number(5), { source: { kind: "loxone", id: ms.id } })
    await admin.post("/api/bus/forces", { topic: "loxone/haus/out/b", value: Value.number(9), reason: "test" })
    await first.dispose()

    const second = await TestApp.start({ databaseFile })
    const app = second.app
    assert.deepEqual(app.signals.list().map(s => s.topic), ["loxone/haus/in/a", "loxone/haus/out/b"])
    assert.deepEqual(app.wires.list().map(w => w.label), ["a to b"])
    assert.deepEqual(app.bus.current("loxone/haus/in/a")?.flags, { restored: true })
    assert.deepEqual(app.bus.current("loxone/haus/out/b")?.value, Value.number(9), "still forced")
    assert.equal(app.bus.current("system/loxone/haus/status")?.flags?.restored, undefined, "status is not part of the snapshot")
    await second.dispose()
  })
})
