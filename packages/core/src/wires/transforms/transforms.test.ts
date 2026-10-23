import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, mock, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { Cause } from "../../bus/BusMessage.ts"
import type { TransformConfig } from "../WireSchema.ts"
import { TransformFactory } from "./TransformFactory.ts"

const cause: Cause = { id: "c", traceId: "c", depth: 0 }
const run = (config: TransformConfig, ...inputs: Value[]) => {
  const out: Value[] = []
  const transform = new TransformFactory().create(config)
  for (const input of inputs) transform.push(input, cause, value => out.push(value))
  return { out, transform }
}

describe("stateless transforms", () => {
  test("invert negates as boolean", () => {
    assert.deepEqual(run({ op: "invert" }, Value.boolean(true), Value.number(0)).out, [Value.boolean(false), Value.boolean(true)])
  })

  test("scale maps ranges and optionally clamps", () => {
    assert.deepEqual(run({ op: "scale", from: [0, 100], to: [0, 255] }, Value.number(50)).out, [Value.number(127.5)])
    assert.deepEqual(run({ op: "scale", from: [0, 100], to: [0, 1], clamp: true }, Value.number(150)).out, [Value.number(1)])
  })

  test("map replaces matches, uses else, or passes through", () => {
    const cases = [{ when: Value.string("on"), then: Value.boolean(true) }]
    assert.deepEqual(run({ op: "map", cases }, Value.string("on"), Value.string("x")).out, [Value.boolean(true), Value.string("x")])
    assert.deepEqual(run({ op: "map", cases, else: Value.boolean(false) }, Value.string("x")).out, [Value.boolean(false)])
  })

  test("convert changes the type", () => {
    assert.deepEqual(run({ op: "convert", to: "string" }, Value.number(3)).out, [Value.string("3")])
  })
})

describe("timed transforms", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }))
  afterEach(() => mock.timers.reset())

  test("debounce emits the latest value after quiet time", () => {
    const { out } = run({ op: "debounce", ms: 100 }, Value.number(1), Value.number(2))
    mock.timers.tick(99)
    assert.deepEqual(out, [])
    mock.timers.tick(1)
    assert.deepEqual(out, [Value.number(2)])
  })

  test("throttle emits the first value at once and the latest at the end of each window", () => {
    const { out, transform } = run({ op: "throttle", ms: 100 }, Value.number(1), Value.number(2), Value.number(3))
    assert.deepEqual(out, [Value.number(1)])
    mock.timers.tick(100)
    assert.deepEqual(out, [Value.number(1), Value.number(3)])
    mock.timers.tick(100)
    assert.equal(out.length, 2)
    const after: Value[] = []
    transform.push(Value.number(4), cause, value => after.push(value))
    assert.deepEqual(after, [Value.number(4)], "a new window starts once the old one is over")
  })

  test("dispose cancels pending timers", () => {
    const { out, transform } = run({ op: "debounce", ms: 100 }, Value.number(1))
    transform.dispose()
    mock.timers.tick(1000)
    assert.deepEqual(out, [])
  })
})
