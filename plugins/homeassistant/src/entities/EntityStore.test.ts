import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { websocketUrl } from "../HomeAssistantConfig.ts"
import { EntityStore } from "./EntityStore.ts"
import { LightState } from "./LightState.ts"
import { StateValue } from "./StateValue.ts"

describe("EntityStore", () => {
  test("applies the compressed format: add, change, attribute removal, remove", () => {
    const store = new EntityStore()
    const seen: string[] = []
    store.on("changed:light.a", state => seen.push(`changed ${state.state}`))
    store.on("removed:light.a", () => seen.push("removed"))
    store.apply({ a: { "light.a": { s: "on", a: { brightness: 10, color_mode: "xy" }, lc: 1 } } }, true)
    store.apply({ c: { "light.a": { "+": { s: "off", a: { brightness: 20 } }, "-": { a: ["color_mode"] } } } }, false)
    assert.deepEqual(store.get("light.a"), { state: "off", attributes: { brightness: 20 }, lastChanged: 1 })
    store.apply({ c: { "light.unknown": { "+": { s: "on" } } } }, false)
    assert.equal(store.get("light.unknown"), undefined, "changes to entities never added are ignored")
    store.apply({ r: ["light.a"] }, false)
    assert.deepEqual(seen, ["changed on", "changed off", "removed"])
  })

  test("a full load after a reconnect removes what disappeared meanwhile", () => {
    const store = new EntityStore()
    let loaded = 0
    store.on("loaded", () => loaded++)
    store.apply({ a: { "switch.a": { s: "on", a: {} }, "switch.b": { s: "off", a: {} } } }, true)
    const removed: string[] = []
    store.on("removed:switch.b", () => removed.push("switch.b"))
    store.apply({ a: { "switch.a": { s: "off", a: {} } } }, true)
    assert.deepEqual([store.size, removed, loaded, store.loaded], [1, ["switch.b"], 2, true])
  })
})

describe("StateValue", () => {
  test("reads states as numbers, booleans or strings, and skips missing readings", () => {
    assert.deepEqual(["21.5", "-3", "1e3", "on", "off", "heat", "", "1.2.3"].map(state => StateValue.fromState(state)), [
      Value.number(21.5), Value.number(-3), Value.number(1000), Value.boolean(true), Value.boolean(false),
      Value.string("heat"), Value.string(""), Value.string("1.2.3")
    ])
    assert.deepEqual([StateValue.fromState("unavailable"), StateValue.fromState("unknown")], [undefined, undefined])
  })

  test("attributes keep their JSON type; lists and objects aren't values", () => {
    assert.deepEqual([12, true, "eco", null, [1, 2], { a: 1 }].map(raw => StateValue.fromAttribute(raw)), [
      Value.number(12), Value.boolean(true), Value.string("eco"), Value.null(), undefined, undefined
    ])
  })
})

describe("LightState", () => {
  test("a light that is on never reads as 0 %", () => {
    const light = (state: string, brightness?: number) => new LightState({ state, attributes: brightness === undefined ? {} : { brightness }, lastChanged: undefined })
    assert.deepEqual([light("on", 1).brightness, light("on", 255).brightness, light("on").brightness, light("off", 200).brightness], [1, 100, 100, 0])
  })
})

describe("websocketUrl", () => {
  test("turns the configured address into the WebSocket API's", () => {
    assert.deepEqual(["http://ha.local:8123", "https://ha.example/", "wss://ha.example/api/websocket"].map(websocketUrl), [
      "ws://ha.local:8123/api/websocket", "wss://ha.example/api/websocket", "wss://ha.example/api/websocket"
    ])
  })
})
