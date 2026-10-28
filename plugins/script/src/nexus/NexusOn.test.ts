import assert from "node:assert/strict"
import { afterEach, describe, mock, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { ScriptHarness } from "../test-support/ScriptHarness.ts"

const { logs } = ScriptHarness

describe("nexus.on and nexus.get", () => {
  const harness = new ScriptHarness()
  afterEach(() => harness.cleanup())

  test("handlers get each value an actuator of the name receives, as a plain value", async () => {
    mock.timers.enable({ apis: ["setTimeout"] })
    const host = await harness.start(`
      const seen = []
      nexus.on("level", value => { seen.push(typeof value + ":" + value); nexus.set("seen", seen.join(" ")) })
      nexus.on("level", value => nexus.set("double", value * 2))
    `)
    const seen = await host.addSensor("text", { name: "seen" })
    const double = await host.addSensor("number", { name: "double" })
    const level = await host.addActuator("number", { name: "level" })
    const flag = await host.addActuator("switch", { name: "level" })
    await host.actuate(level, Value.number(3))
    mock.timers.tick(100)
    await host.actuate(level, Value.string("4"))
    mock.timers.tick(100)
    await host.actuate(flag, Value.boolean(true))
    mock.timers.tick(100)
    assert.deepEqual(host.values(seen).at(-1), Value.string("number:3 number:4 boolean:true"))
    assert.deepEqual(host.values(double).at(-1), Value.number(2))
  })

  test("get returns the latest received value, undefined before the first", async () => {
    const host = await harness.start(`
      nexus.set("before", String(nexus.get("text")))
      nexus.on("ask", () => nexus.set("now", nexus.get("text")))
    `)
    const before = await host.addSensor("text", { name: "before" })
    const now = await host.addSensor("text", { name: "now" })
    await host.actuate(await host.addActuator("text", { name: "text" }), Value.string("hello"))
    await host.actuate(await host.addActuator("switch", { name: "ask" }), Value.boolean(true))
    assert.deepEqual(host.values(before), [Value.string("undefined")])
    assert.deepEqual(host.values(now), [Value.string("hello")])
  })

  test("a throwing or rejecting handler fails the command with the script's message", async () => {
    const host = await harness.start(`
      nexus.on("sync", value => { if (value > 1) throw new RangeError("too big: " + value) })
      nexus.on("async", async () => { await null; throw new Error("later") })
      nexus.on("async", () => nexus.set("ran", true))
    `)
    const sync = await host.addActuator("number", { name: "sync" })
    await host.actuate(sync, Value.number(1))
    await assert.rejects(host.actuate(sync, Value.number(5)), { message: "line 2, column 56: RangeError: too big: 5" })
    const ran = await host.addSensor("switch", { name: "ran" })
    await assert.rejects(host.actuate(await host.addActuator("number", { name: "async" }), Value.number(1)), {
      message: "line 3, column 57: later"
    })
    assert.deepEqual(host.values(ran), [Value.boolean(true)], "the other handler still ran")
    assert.equal(logs(host, "error").length, 2)
    assert.equal(host.status.status, "running")
  })

  test("the function on() returns removes the handler; a value without a handler is only stored", async () => {
    const host = await harness.start(`
      let calls = 0
      const off = nexus.on("x", () => { calls++; off(); nexus.set("calls", calls) })
      nexus.on("check", () => nexus.set("latest", nexus.get("x")))
    `)
    const calls = await host.addSensor("number", { name: "calls" })
    const latest = await host.addSensor("number", { name: "latest" })
    const x = await host.addActuator("number", { name: "x" })
    await host.actuate(x, Value.number(1))
    await host.actuate(x, Value.number(2))
    await host.actuate(await host.addActuator("switch", { name: "check" }), Value.boolean(true))
    assert.deepEqual(host.values(calls), [Value.number(1)])
    assert.deepEqual(host.values(latest), [Value.number(2)])
  })

  test("on refuses a handler that isn't a function, get an invalid name", async () => {
    const host = await harness.start(`
      const result = []
      try { nexus.on("x", "not a function") } catch (error) { result.push(error.message) }
      try { nexus.get("no/slash") } catch (error) { result.push(error instanceof TypeError) }
      nexus.set("result", result.join("|"))
    `)
    const result = await host.addSensor("text", { name: "result" })
    assert.deepEqual(host.values(result), [Value.string("nexus.on(\"x\"): the handler must be a function|true")])
  })
})
