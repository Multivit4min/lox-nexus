import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { DateTimeParts } from "./DateTimeParts.ts"

const parts = (value: Value) => {
  const read = DateTimeParts.of(value)
  return read && [read.date, read.time]
}

describe("DateTimeParts", () => {
  test("reads a date, a time or both from text", () => {
    assert.deepEqual(parts(Value.string("2026-10-28 06:30:00")), ["2026-10-28", "06:30:00"])
    assert.deepEqual(parts(Value.string(" 2026-10-28T6:30 ")), ["2026-10-28", "06:30:00"])
    assert.deepEqual(parts(Value.string("2026-10-28")), ["2026-10-28", undefined])
    assert.deepEqual(parts(Value.string("23:05")), [undefined, "23:05:00"])
    assert.equal(parts(Value.string("")), undefined, "empty text sets nothing")
  })

  test("reads a number as seconds since midnight", () => {
    assert.deepEqual(parts(Value.number(23_400)), [undefined, "06:30:00"])
    assert.deepEqual(parts(Value.number(86_399.9)), [undefined, "23:59:59"])
    assert.deepEqual(parts(Value.number(0)), [undefined, "00:00:00"])
  })

  test("refuses anything else", () => {
    assert.throws(() => DateTimeParts.of(Value.number(86_400)), /0 to 86399 seconds/)
    assert.throws(() => DateTimeParts.of(Value.number(-1)), /0 to 86399 seconds/)
    for (const text of ["24:00", "2026-13-01", "28.10.2026", "06:30 2026-10-28", "tomorrow", "2026-10-28 06:30 x"]) {
      assert.throws(() => DateTimeParts.of(Value.string(text)), /is not a date or time/, text)
    }
    assert.throws(() => DateTimeParts.of(Value.boolean(true)), /not boolean/)
  })
})
