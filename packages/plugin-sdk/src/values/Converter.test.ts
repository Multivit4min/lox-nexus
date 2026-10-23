import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { Converter } from "./Converter.ts"
import { Value, type ValueType } from "./Value.ts"

/** golden expectations ported from old/loxone-nexus/tests/conversion/VariableConverter.spec.ts */
const to = (value: Value, type: ValueType) => {
  const result = Converter.convert(value, type)
  return result.type === "null" ? null : result.value
}
const single = (channel: number, fadeTime = 0.2) => ({ channel, fadeTime })
const rgbw = (white: number, fadeTime = 0.2) => ({ red: 0, green: 0, blue: 0, white, fadeTime, flags: 0 })

describe("Converter (golden, old behaviour)", () => {
  test("number", () => {
    const [a, b, c] = [123, 85, 0].map(Value.number)
    assert.deepEqual([a, b, c].map(v => to(v!, "boolean")), [true, true, false])
    assert.deepEqual([a, b, c].map(v => to(v!, "string")), ["123", "85", "0"])
    assert.deepEqual([a, b, c].map(v => to(v!, "singleChannel")), [single(100), single(85), single(0)])
    assert.deepEqual([a, b, c].map(v => to(v!, "rgbw")), [rgbw(100), rgbw(85), rgbw(0)])
  })

  test("boolean", () => {
    const [on, off] = [true, false].map(Value.boolean)
    assert.deepEqual([to(on!, "number"), to(off!, "number")], [1, 0])
    assert.deepEqual([to(on!, "string"), to(off!, "string")], ["true", "false"])
    assert.deepEqual([to(on!, "singleChannel"), to(off!, "singleChannel")], [single(100), single(0)])
    assert.deepEqual([to(on!, "rgbw"), to(off!, "rgbw")], [rgbw(100), rgbw(0)])
  })

  test("string", () => {
    const values = ["85$", "hello world", "true", "on"].map(Value.string)
    assert.deepEqual(values.map(v => to(v, "boolean")), [false, false, true, true])
    assert.deepEqual(values.map(v => to(v, "number")), [85, 0, 0, 0])
    assert.deepEqual(values.map(v => to(v, "string")), ["85$", "hello world", "true", "on"])
    assert.deepEqual(values.map(v => to(v, "singleChannel")), [single(85), single(0), single(0), single(0)])
    assert.deepEqual(values.map(v => to(v, "rgbw")), [rgbw(85), rgbw(0), rgbw(0), rgbw(0)])
  })

  test("single channel", () => {
    const values = [single(15, 3), single(100, 2), single(0, 1)].map(Value.singleChannel)
    assert.deepEqual(values.map(v => to(v, "boolean")), [true, true, false])
    assert.deepEqual(values.map(v => to(v, "number")), [15, 100, 0])
    assert.deepEqual(values.map(v => to(v, "string")), ["15% 3s", "100% 2s", "0% 1s"])
    assert.deepEqual(values.map(v => to(v, "rgbw")), [rgbw(15, 3), rgbw(100, 2), rgbw(0, 1)])
  })

  test("rgbw", () => {
    const values = [
      { red: 15, green: 100, blue: 0, white: 50, fadeTime: 3, flags: 0 },
      { red: 0, green: 0, blue: 0, white: 0, fadeTime: 2, flags: 0 },
      { red: 100, green: 100, blue: 100, white: 100, fadeTime: 1, flags: 0 }
    ].map(Value.rgbw)
    assert.deepEqual(values.map(v => to(v, "boolean")), [true, false, true])
    assert.deepEqual(values.map(v => to(v, "number")), [0x26ff007f, 0, 0xffffffff])
    assert.deepEqual(values.map(v => to(v, "string")), ["#26ff007f 3s", "#00000000 2s", "#ffffffff 1s"])
    assert.deepEqual(values.map(v => to(v, "singleChannel")), [single(41, 3), single(0, 2), single(100, 1)])
  })
})

describe("Converter (deliberate changes)", () => {
  test("rgbw → tunable white keeps the fade time (old bug at VariableConverter.ts:185)", () => {
    const result = to(Value.rgbw({ red: 100, green: 60, blue: 0, white: 80, fadeTime: 3, flags: 0 }), "tunableWhite")
    assert.deepEqual(result, { temperature: 2700, brightness: 80, fadeTime: 3 })
  })

  test("every structured type defaults to a 0.2 s fade", () => {
    for (const type of ["singleChannel", "rgbw", "tunableWhite"] as const) {
      assert.equal((Converter.convert(Value.null(), type).value as { fadeTime: number }).fadeTime, 0.2, type)
    }
  })

  test("percent channels are rounded to whole numbers, the wire resolution", () => {
    assert.deepEqual(to(Value.number(85.6), "singleChannel"), single(86))
  })

  test("non-finite inputs never produce non-finite values", () => {
    assert.deepEqual(to(Value.number(Number.NaN), "rgbw"), rgbw(0))
    const infiniteFade = Value.tunableWhite({ temperature: 4000, brightness: 50, fadeTime: Infinity })
    assert.deepEqual(to(infiniteFade, "singleChannel"), single(50, 0.2))
  })

  test("numbers become strings rounded to 5 decimals, like the old serializer", () => {
    assert.equal(to(Value.number(0.1 + 0.2), "string"), "0.3")
  })

  test("tunable white clamps temperature and brightness", () => {
    assert.deepEqual(to(Value.number(150), "tunableWhite"), { temperature: 4000, brightness: 100, fadeTime: 0.2 })
  })

  test("t5 maps to numbers and names; only valid masks convert back", () => {
    const t5 = Value.t5({ buttons: 5 })
    assert.deepEqual([to(t5, "number"), to(t5, "boolean"), to(t5, "string")], [5, true, "left-upper+middle"])
    assert.deepEqual(to(Value.number(4), "t5"), { buttons: 4 })
    assert.deepEqual(to(Value.number(40), "t5"), { buttons: 0 })
  })

  test("same-type conversion returns the value unchanged", () => {
    const value = Value.rgbw({ red: 1, green: 2, blue: 3, white: 4, fadeTime: 5, flags: 0x4000 })
    assert.equal(Converter.convert(value, "rgbw"), value)
  })
})
