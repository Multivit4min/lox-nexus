import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { TransformDraft } from "./TransformDraft.ts"
import { WireTypes } from "./WireTypes.ts"

describe("WireTypes", () => {
  test("fits: same, sensible conversions, and odd ones", () => {
    assert.equal(WireTypes.fit("number", "number"), "same")
    assert.equal(WireTypes.fit("any", "rgbw"), "same")
    assert.equal(WireTypes.fit("boolean", "number"), "converts")
    assert.equal(WireTypes.fit("number", "rgbw"), "converts")
    assert.equal(WireTypes.fit("rgbw", "number"), "converts", "both directions count")
    assert.equal(WireTypes.fit("t5", "boolean"), "converts")
    assert.equal(WireTypes.fit("t5", "rgbw"), "unusual")
    assert.equal(WireTypes.fit("string", "tunableWhite"), "unusual")
  })

  test("the transforms decide what reaches the target", () => {
    assert.equal(WireTypes.output("rgbw", []), "rgbw")
    assert.equal(WireTypes.output("rgbw", [{ op: "invert" }, { op: "debounce", ms: 5 }]), "boolean")
    assert.equal(WireTypes.output("boolean", [{ op: "scale", from: [0, 1], to: [0, 100] }]), "number")
    assert.equal(WireTypes.output("number", [{ op: "convert", to: "string" }]), "string")
    const map = { op: "map" as const, cases: [{ when: Value.number(1), then: Value.string("on") }] }
    assert.equal(WireTypes.output("number", [map]), "any", "unmatched numbers pass through next to strings")
    assert.equal(WireTypes.output("number", [{ ...map, else: Value.string("off") }]), "string")
  })
})

describe("TransformDraft", () => {
  test("every new step parses, and a step survives the way through its draft", () => {
    for (const op of ["invert", "scale", "map", "debounce", "throttle", "convert"] as const) {
      const parsed = TransformDraft.parse(TransformDraft.create(op))
      assert.ok("step" in parsed, op)
      assert.deepEqual(TransformDraft.parse(TransformDraft.from(parsed.step)), parsed, op)
    }
  })

  test("says what to fix", () => {
    const scale = { op: "scale" as const, from: ["0", "x"] as [string, string], to: ["0", "1"] as [string, string], clamp: false }
    assert.deepEqual(TransformDraft.parse(scale), { error: "from: enter a number" })
    assert.deepEqual(TransformDraft.parse({ ...scale, from: ["5", "5"] }), { error: "the input range must not be empty" })
    assert.match(JSON.stringify(TransformDraft.parse({ op: "debounce", ms: "0.5" })), /whole milliseconds/)
    const map = { op: "map" as const, cases: [{ when: { type: "number" as const, text: "1" }, then: { type: "boolean" as const, text: "maybe" } }] }
    assert.deepEqual(TransformDraft.parse(map), { error: "case 1: then: not a boolean" })
  })

  test("accepts a decimal comma", () => {
    const parsed = TransformDraft.parse({ op: "scale", from: ["0", "2,5"], to: ["0", "1"], clamp: true })
    assert.deepEqual(parsed, { step: { op: "scale", from: [0, 2.5], to: [0, 1], clamp: true } })
  })

  test("summaries", () => {
    assert.equal(TransformDraft.summary({ op: "scale", from: [0, 100], to: [0, 255], clamp: true }), "scale 0…100 → 0…255 (clamped)")
    assert.equal(TransformDraft.summary({ op: "throttle", ms: 1000 }), "throttle 1000 ms")
    assert.equal(TransformDraft.summary({ op: "unsupported", raw: { op: "scale" } }), "unsupported step")
  })
})
