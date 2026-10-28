import assert from "node:assert/strict"
import { afterEach, describe, mock, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { ScriptHarness } from "../test-support/ScriptHarness.ts"

describe("nexus.set", () => {
  const harness = new ScriptHarness()
  afterEach(() => harness.cleanup())

  test("sends the value to every sensor of the name, converted to its type", async () => {
    const host = await harness.start("nexus.on(\"go\", value => nexus.set(\"x\", value))")
    const number = await host.addSensor("number", { name: "x" })
    const text = await host.addSensor("text", { name: "x" })
    const flag = await host.addSensor("switch", { name: "x" })
    const other = await host.addSensor("number", { name: "y" })
    await host.actuate(await host.addActuator("text", { name: "go" }), Value.string("21,5"))
    assert.deepEqual(host.values(number), [Value.number(21.5)])
    assert.deepEqual(host.values(text), [Value.string("21,5")])
    assert.deepEqual(host.values(flag), [Value.boolean(false)])
    assert.deepEqual(host.values(other), [])
  })

  test("is throttled per name: the first value at once, the latest at the end of the window", async () => {
    mock.timers.enable({ apis: ["setTimeout"] })
    const host = await harness.start(`nexus.on("go", value => {
      for (let i = 0; i < 5; i++) nexus.set("x", value + i)
      nexus.set("y", -value)
    })`)
    const x = await host.addSensor("number", { name: "x" })
    const y = await host.addSensor("number", { name: "y" })
    const go = await host.addActuator("number", { name: "go" })
    await host.actuate(go, Value.number(10))
    assert.deepEqual(host.values(x), [Value.number(10)])
    assert.deepEqual(host.values(y), [Value.number(-10)], "other names have their own window")
    mock.timers.tick(99)
    assert.deepEqual(host.values(x), [Value.number(10)])
    mock.timers.tick(1)
    assert.deepEqual(host.values(x), [Value.number(10), Value.number(14)])
    mock.timers.tick(100)
    assert.equal(host.values(x).length, 2, "nothing new, no further emit")
    mock.timers.tick(100)
    await host.actuate(go, Value.number(20))
    assert.deepEqual(host.values(x).at(-1), Value.number(20), "a quiet name sends at once again")
  })

  test("a sensor added later starts with the latest value of its name", async () => {
    const host = await harness.start("nexus.set(\"later\", 1)\nnexus.set(\"later\", \"on\")\nnexus.set(\"rgb\", { type: \"rgbw\", value: { red: 100, green: 0, blue: 0, white: 0, fadeTime: 0, flags: 0 } })")
    const later = await host.addSensor("switch", { name: "later" })
    assert.deepEqual(host.values(later), [Value.boolean(true)])
    const rgb = await host.addSensor("number", { name: "rgb" })
    assert.deepEqual(host.values(rgb), [Value.number(0xff000000)])
  })

  test("converts script values: null, undefined, dates and objects", async () => {
    const host = await harness.start(`
      nexus.set("a", null)
      nexus.set("b", undefined)
      nexus.set("c", new Date(Date.UTC(2026, 9, 28, 12)))
      nexus.set("d", { on: true, list: [1, 2] })
    `)
    const texts = await Promise.all(["a", "b", "c", "d"].map(name => host.addSensor("text", { name })))
    assert.deepEqual(texts.map(id => host.values(id)), [
      [Value.string("")], [Value.string("")], [Value.string("2026-10-28T12:00:00.000Z")], [Value.string("{\"on\":true,\"list\":[1,2]}")]
    ])
  })

  test("refuses values and names that can't be sent with a TypeError of the script", async () => {
    const host = await harness.start(`
      const tries = [() => nexus.set("f", () => 1), () => nexus.set("s", Symbol("x")), () => nexus.set("n", NaN),
        () => nexus.set("b", 1n), () => nexus.set("bad name", 1), () => nexus.set("x".repeat(65), 1), () => nexus.set(42, 1),
        () => nexus.set("c", { type: "rgbw", value: 3 }), () => { const o = {}; o.o = o; nexus.set("o", o) }, () => nexus.set("t", "x".repeat(4097))]
      nexus.set("errors", tries.map(attempt => {
        try { attempt(); return "sent" } catch (error) { return (error instanceof TypeError ? "" : "NOT A TYPEERROR ") + error.message }
      }).join("\\n"))
    `)
    const errors = await host.addSensor("text", { name: "errors" })
    assert.deepEqual((host.values(errors)[0] as { value: string }).value.split("\n"), [
      "nexus.set(\"f\"): a function can't be sent",
      "nexus.set(\"s\"): a symbol can't be sent",
      "nexus.set(\"n\"): NaN is not a finite number",
      "nexus.set(\"b\"): a BigInt can't be sent; convert it with Number()",
      "nexus.set: invalid variable name \"bad name\"; use 1 to 64 letters, digits, \"_\", \".\" or \"-\"",
      `nexus.set: invalid variable name "${"x".repeat(65)}"; use 1 to 64 letters, digits, "_", "." or "-"`,
      "nexus.set: invalid variable name a number; use 1 to 64 letters, digits, \"_\", \".\" or \"-\"",
      "nexus.set(\"c\"): not a valid rgbw value",
      "nexus.set(\"o\"): the object can't be written as JSON (Converting circular structure to JSON)",
      "nexus.set(\"t\"): text longer than 4096 characters"
    ])
  })

  test("signals refuse invalid names", async () => {
    const host = await harness.start("")
    await assert.rejects(host.addSensor("number", { name: "a b" }))
    await assert.rejects(host.addActuator("number", { name: "" }))
  })
})
