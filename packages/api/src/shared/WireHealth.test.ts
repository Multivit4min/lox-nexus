import assert from "node:assert/strict"
import { describe, test } from "node:test"
import type { MiniserverDto, PluginInstanceDto, SignalDto, WireDto } from "../index.ts"
import { WireHealth } from "./WireHealth.ts"

describe("WireHealth", () => {
  const signal = (id: string, owner: string, extra: Partial<SignalDto> = {}): SignalDto =>
    ({ id, topic: `x/${id}`, label: id, direction: "source", valueType: "number", delivery: "state", owner: { kind: owner === "ms" ? "miniserver" : "plugin", id: owner }, ...extra })
  const wire: WireDto = { id: "w", label: "w", sourceId: "a", targetId: "b", transforms: [], enabled: true, syncOnStart: false, active: true }
  const ms = { id: "ms", label: "Haus", running: true, health: "online" } as MiniserverDto
  const plugin = { id: "p", label: "Fronius", state: "running" } as PluginInstanceDto
  const health = (msRunning: boolean, pluginState: PluginInstanceDto["state"], target: Partial<SignalDto> = {}) => new WireHealth(
    new Map([["a", signal("a", "p")], ["b", signal("b", "ms", { direction: "target", ...target })]]),
    WireHealth.owners([{ ...ms, running: msRunning }], [{ ...plugin, state: pluginState }]))

  test("explains in order: not running, switched off, stopped owners, a forced target", () => {
    assert.deepEqual(health(true, "running").of({ ...wire, active: false, problem: "bad" }), { level: "broken", text: "bad" })
    assert.equal(health(true, "running").of({ ...wire, enabled: false }).level, "off")
    assert.deepEqual(health(true, "crashed").of(wire), { level: "idle", text: "no values while plugin \"Fronius\" is crashed" })
    assert.deepEqual(health(true, "error").of(wire).text, "no values while plugin \"Fronius\" is in error")
    assert.deepEqual(health(false, "degraded").of(wire), { level: "idle", text: "values don't reach Miniserver \"Haus\" while it is stopped" })
    const forced = { current: { flags: { forced: true } } } as Partial<SignalDto>
    assert.equal(health(true, "running", forced).of(wire).level, "idle")
    assert.deepEqual(health(true, "running").of(wire), { level: "ok", text: "values flow" })
  })

  test("a running Miniserver that isn't heard from delivers nothing, but still accepts values", () => {
    const owners = WireHealth.owners([{ ...ms, health: "stale" }], [plugin])
    const signals = new Map([["a", signal("a", "ms")], ["b", signal("b", "p", { direction: "target" })]])
    assert.deepEqual(new WireHealth(signals, owners).of(wire).text, "no values while Miniserver \"Haus\" is silent (stale)")
    const reversed = new Map([["a", signal("a", "p")], ["b", signal("b", "ms", { direction: "target" })]])
    assert.equal(new WireHealth(reversed, owners).of(wire).level, "ok")
  })

  test("a stale source idles its wire, while its owner runs", () => {
    const owners = WireHealth.owners([ms], [plugin])
    const signals = new Map([["a", signal("a", "p", { staleAfterMin: 5 })], ["b", signal("b", "ms", { direction: "target" })]])
    const stale = (topic: string) => (topic === signals.get("a")!.topic ? { signalId: "a", topic } : undefined)
    assert.deepEqual(new WireHealth(signals, owners, stale).of(wire), { level: "idle", text: "source stale: \"a\" sent no value for longer than 5 min" })
  })

  test("a forced source is mentioned, the wire still carries its value", () => {
    const signals = new Map([["a", signal("a", "p", { current: { flags: { forced: true } } } as Partial<SignalDto>)], ["b", signal("b", "ms", { direction: "target" })]])
    assert.deepEqual(new WireHealth(signals, WireHealth.owners([ms], [plugin])).of(wire), { level: "ok", text: "\"a\" is forced: the wire carries the forced value" })
  })
})
