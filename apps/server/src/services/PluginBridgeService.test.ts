import assert from "node:assert/strict"
import { describe, test } from "node:test"
import type { BridgeResultDto, LoxoneSignalDto, PluginSignalDto, WireDto } from "@lox-nexus/api"
import { HttpError } from "../http/HttpError.ts"
import { PluginBridgeService } from "./PluginBridgeService.ts"

const added: PluginSignalDto = { id: "p1", instanceId: "i", kind: "sensor", capability: "value", params: {}, label: "Power", slug: "power", topic: "t/p", valueType: "number" }
const loxone = { id: "l1", miniserverId: "m", packetId: "power", direction: "out", dataType: 1, label: "Power", topic: "loxone/m/out/power", valueType: "number" } as LoxoneSignalDto

/** fakes around one sensor item whose wire fails; `removeFails` makes the plugin signal stay */
function setup(wireError: Error, removeFails = false) {
  const logged: Array<[string, string]> = []
  const removed: string[] = []
  const service = new PluginBridgeService(
    {
      list: () => [],
      add: async () => added,
      remove: async () => {
        if (removeFails) throw new Error("worker hangs")
        removed.push("plugin")
      }
    },
    { list: () => [], add: () => loxone, remove: () => void removed.push("loxone"), forgetDiscovered: () => undefined },
    {
      create: (): WireDto => {
        throw wireError
      }
    },
    { warn: (_: unknown, message: string) => void logged.push(["warn", message]), error: (_: unknown, message: string) => void logged.push(["error", message]) } as never
  )
  const run = async () => (await service.bridge("i", { miniserverId: "m", items: [{ plugin: { type: "new", signal: { kind: "sensor", capability: "value", label: "Power" } }, loxone: { packetId: "power", dataType: 1 } }] }, "admin"))[0]!
  return { run, logged, removed }
}

describe("PluginBridgeService undo", () => {
  test("a refused step removes the Loxone signal, then the plugin signal, and isn't logged", async () => {
    const { run, logged, removed } = setup(HttpError.conflict("taken"))
    assert.deepEqual(await run(), { ok: false, label: "Power", error: "taken" } satisfies BridgeResultDto)
    assert.deepEqual(removed, ["loxone", "plugin"])
    assert.deepEqual(logged, [])
  })

  test("what can't be removed is reported and logged, and so is an unexpected error", async () => {
    const { run, logged, removed } = setup(new Error("disk I/O error"), true)
    assert.deepEqual(await run(), { ok: false, label: "Power", error: "disk I/O error", leftover: ["plugin signal \"Power\""] })
    assert.deepEqual(removed, ["loxone"])
    assert.deepEqual(logged.map(([level]) => level), ["error", "warn"])
  })
})
