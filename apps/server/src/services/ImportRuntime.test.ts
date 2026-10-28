import assert from "node:assert/strict"
import { test } from "node:test"
import { ConfigExportSchema } from "@lox-nexus/api"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { TestApp } from "../test-support/TestApp.ts"

test("an import keeps forces and last values on topics that exist after it, and releases the rest", async t => {
  const test = await TestApp.start()
  t.after(() => test.dispose())
  const admin = await test.admin()
  const ms = (await admin.post("/api/miniservers", {
    slug: "haus", label: "Haus", host: "127.0.0.1", port: 7000, listenPort: 7001, ownId: "nexus", remoteId: "ms", enabled: false
  })).json<{ id: string }>()
  const add = async (packetId: string, direction: "in" | "out") =>
    (await admin.post(`/api/miniservers/${ms.id}/signals`, { packetId, direction, dataType: 1, label: packetId.toUpperCase() })).json<{ id: string }>()
  await add("a", "in")
  await add("b", "out")
  const c = await add("c", "out")
  const bus = test.app.bus
  bus.publish("loxone/haus/in/a", Value.number(5), { source: { kind: "loxone", id: ms.id } })
  await admin.post("/api/bus/forces", { topic: "loxone/haus/out/b", value: Value.number(9), reason: "test" })
  await admin.post("/api/bus/forces", { topic: "loxone/haus/out/c", value: Value.number(3), reason: "test" })

  const doc = ConfigExportSchema.parse((await admin.get("/api/config/export")).json())
  // the file no longer has signal c
  const withoutC = { ...doc, miniservers: doc.miniservers.map(m => ({ ...m, signals: m.signals.filter(s => s.id !== c.id) })) }
  assert.equal((await admin.post("/api/config/import", withoutC)).statusCode, 200)

  assert.deepEqual(bus.current("loxone/haus/in/a")?.value, Value.number(5))
  assert.deepEqual(bus.current("loxone/haus/out/b")?.value, Value.number(9), "still forced")
  assert.deepEqual(bus.activeForces().map(force => force.topic), ["loxone/haus/out/b"], "the force on the removed signal is released")
})
