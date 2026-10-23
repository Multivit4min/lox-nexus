import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { Value } from "./Value.ts"
import { Numbers } from "./Numbers.ts"
import { ValueFormatter } from "./ValueFormatter.ts"
import { ValueSchema } from "./ValueSchema.ts"

describe("Value", () => {
  test("equals compares structurally", () => {
    assert.ok(Value.equals(Value.number(1), Value.number(1)))
    assert.ok(Value.equals(Value.number(Number.NaN), Value.number(Number.NaN)))
    assert.ok(!Value.equals(Value.number(1), Value.string("1")))
    assert.ok(Value.equals(Value.singleChannel({ channel: 5, fadeTime: 1 }), Value.singleChannel({ channel: 5, fadeTime: 1 })))
    assert.ok(!Value.equals(Value.singleChannel({ channel: 5, fadeTime: 1 }), Value.singleChannel({ channel: 5, fadeTime: 2 })))
    assert.ok(Value.equals(Value.null(), Value.null()))
    assert.ok(!Value.equals(Value.null(), undefined))
    assert.ok(Value.equals(Value.number(0), Value.number(-0)), "0 and -0 must not look like a change")
  })

  test("schema accepts valid values and rejects invalid ones", () => {
    assert.ok(ValueSchema.safeParse(Value.rgbw({ red: 1, green: 2, blue: 3, white: 4, fadeTime: 0.2, flags: 0x4000 })).success)
    assert.ok(!ValueSchema.safeParse({ type: "rgbw", value: { red: 101 } }).success)
    assert.ok(!ValueSchema.safeParse({ type: "number", value: "1" }).success)
    assert.ok(!ValueSchema.safeParse({ type: "weird" }).success)
  })

  test("Numbers.scale keeps the old scaleNumber results; clamp rejects non-finite input", () => {
    assert.deepEqual([50, 10, 20, 80].map(n => Numbers.scale(n, 0, 100, 0, 255)), [127.5, 25.5, 51, 204])
    assert.equal(Numbers.clamp(Infinity, 0, Infinity, 0.2), 0.2)
    assert.equal(Numbers.clamp(Number.NaN, 0, 100, 7), 7)
  })

  test("formatter renders every type readably", () => {
    const f = new ValueFormatter()
    assert.equal(f.format(Value.number(1 / 3)), "0.333")
    assert.equal(f.format(Value.string("hi")), "\"hi\"")
    assert.equal(f.format(Value.rgbw({ red: 100, green: 9, blue: 6, white: 0, fadeTime: 3, flags: 0x4000 })), "r100 g9 b6 w0 3s flags 0x4000")
    assert.equal(f.format(Value.tunableWhite({ temperature: 4000, brightness: 80, fadeTime: 0.2 })), "4000K 80% 0.2s")
    assert.equal(f.format(Value.t5({ buttons: 0 })), "t5[none]")
  })
})
