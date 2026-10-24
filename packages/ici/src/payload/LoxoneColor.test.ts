import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { Fixtures } from "../test-support/Fixtures.ts"
import { LoxoneColor } from "./LoxoneColor.ts"

describe("LoxoneColor", () => {
  test("parses temperatures and RGB colours, and formats them back", () => {
    const cases: Array<[number, ReturnType<typeof LoxoneColor.parse>]> = [
      [200702200, { kind: "temperature", brightness: 70, kelvin: 2200 }],
      [200004600, { kind: "temperature", brightness: 0, kelvin: 4600 }],
      [201006500, { kind: "temperature", brightness: 100, kelvin: 6500 }],
      [100, { kind: "rgb", red: 100, green: 0, blue: 0 }],
      [60001000, { kind: "rgb", red: 0, green: 1, blue: 60 }],
      [0, { kind: "rgb", red: 0, green: 0, blue: 0 }]
    ]
    for (const [number, color] of cases) {
      assert.deepEqual(LoxoneColor.parse(number), color, String(number))
      assert.equal(LoxoneColor.format(color!), number)
    }
  })

  test("anything else is not a colour number", () => {
    for (const number of [-1, 2.5, 101, 100101100, 150000000, 201014600, 200000000, Number.NaN]) {
      assert.equal(LoxoneColor.parse(number), undefined, String(number))
    }
    assert.deepEqual(LoxoneColor.parse(-0), { kind: "rgb", red: 0, green: 0, blue: 0 }, "no channels of -0")
    assert.throws(() => LoxoneColor.format({ kind: "temperature", brightness: 101, kelvin: 3000 }), RangeError)
    assert.throws(() => LoxoneColor.format({ kind: "rgb", red: 1.5, green: 0, blue: 0 }), RangeError)
  })

  test("captured Lumitech moods: the analog number and the RGBW bytes say the same; Smart RGBW stays RGBW", () => {
    const lines = Fixtures.lines<{ dir: string; id: string; payload?: string }>("2026-10-23-live/lumitech-moods-2026-10-24.jsonl").filter(line => line.dir === "rx")
    const analog = lines.filter(line => line.id === "lcana").map(line => Buffer.from(line.payload!, "hex").readDoubleLE(0))
    const fromRgbw = lines.filter(line => line.id === "lcout").map(line => LoxoneColor.fromRgbwPayload(Buffer.from(line.payload!, "hex")))
    assert.ok(analog.length >= 10)
    assert.deepEqual(fromRgbw, analog.map(number => LoxoneColor.parse(number)), "lcout is lcana's number in RGBW clothing")
    // resends repeat a mood; each distinct value once, in order
    const distinct = fromRgbw.filter((color, i) => i === 0 || JSON.stringify(color) !== JSON.stringify(fromRgbw[i - 1]))
    assert.deepEqual(distinct.slice(0, 5), [
      { kind: "temperature", brightness: 80, kelvin: 4700 }, { kind: "rgb", red: 100, green: 0, blue: 0 },
      { kind: "rgb", red: 0, green: 80, blue: 0 }, { kind: "rgb", red: 0, green: 1, blue: 60 }, { kind: "temperature", brightness: 70, kelvin: 2200 }
    ])
    for (const line of lines.filter(line => line.id === "lcout2")) {
      assert.equal(LoxoneColor.fromRgbwPayload(Buffer.from(line.payload!, "hex")), undefined, "a real RGBW payload")
    }
    const step = Buffer.from("640906001e000040", "hex")
    assert.equal(LoxoneColor.fromRgbwPayload(step), undefined, "a sequence step stays RGBW")
  })
})
