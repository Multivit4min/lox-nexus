import assert from "node:assert/strict"
import { test } from "node:test"
import type { WatchedSignal, WatchedValue } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { PointMapper } from "./PointMapper.ts"

const all = { measurement: "lox_nexus", tagTopic: true, tagLabel: true, tagOwner: true }
const signal: WatchedSignal = { id: "s1", topic: "loxone/home/in/t", label: "Living room", valueType: "any", owner: { kind: "miniserver", id: "ms1" } }
const watched = (value: Value, extra: Partial<WatchedValue> = {}): WatchedValue => ({ signalId: "s1", ts: 1000, kind: "state", value, ...extra })

test("each value type has its own fixed fields", () => {
  const cases: Array<[Value, Record<string, unknown> | undefined]> = [
    [Value.number(21.5), { value: 21.5 }],
    [Value.boolean(true), { value: 1 }],
    [Value.boolean(false), { value: 0 }],
    [Value.t5({ buttons: 5 }), { value: 5 }],
    [Value.string("eco"), { text: "eco" }],
    [Value.singleChannel({ channel: 40, fadeTime: 1.5 }), { brightness: 40, fade_time: 1.5 }],
    [Value.tunableWhite({ brightness: 80, temperature: 3000, fadeTime: 0.2 }), { brightness: 80, temperature: 3000, fade_time: 0.2 }],
    [Value.rgbw({ red: 100, green: 50, blue: 0, white: 10, fadeTime: 1, flags: 3 }), { red: 100, green: 50, blue: 0, white: 10, fade_time: 1 }],
    [Value.null(), undefined]
  ]
  const mapper = new PointMapper(all)
  for (const [value, fields] of cases) assert.deepEqual(mapper.map(watched(value), signal)?.fields, fields, value.type)
})

test("tags: signal_id and value_type always, topic, label and owner as configured", () => {
  const point = new PointMapper(all).map(watched(Value.number(1)), signal)
  assert.deepEqual(point, {
    measurement: "lox_nexus",
    tags: { signal_id: "s1", value_type: "number", topic: "loxone/home/in/t", label: "Living room", owner: "miniserver:ms1" },
    fields: { value: 1 },
    ts: 1000
  })
  const bare = new PointMapper({ measurement: "m", tagTopic: false, tagLabel: false, tagOwner: false })
  assert.deepEqual(bare.map(watched(Value.number(1)), signal)?.tags, { signal_id: "s1", value_type: "number" })
  const plugin = new PointMapper(all).map(watched(Value.number(1)), { ...signal, owner: { kind: "plugin", id: "hue" } })
  assert.equal(plugin?.tags.owner, "plugin:hue")
})

test("value_type is the value's own type, so a signal of type any splits by it", () => {
  assert.equal(new PointMapper(all).map(watched(Value.string("x")), signal)?.tags.value_type, "string")
})

test("a forced value gets forced=true; a signal without owner gets no owner tag", () => {
  const mapper = new PointMapper(all)
  assert.deepEqual(mapper.map(watched(Value.boolean(true), { forced: true }), signal)?.fields, { value: 1, forced: true })
  const ownerless: WatchedSignal = { id: "s1", topic: "t", label: "L", valueType: "number" }
  assert.equal(mapper.map(watched(Value.number(1)), ownerless)?.tags.owner, undefined)
})
