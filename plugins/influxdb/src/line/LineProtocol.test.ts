import assert from "node:assert/strict"
import { test } from "node:test"
import { LineProtocol, type Point } from "./LineProtocol.ts"

const point = (overrides: Partial<Point>): Point => ({ measurement: "m", tags: {}, fields: { value: 1 }, ts: 1_700_000_000_000, ...overrides })

test("measurement names escape commas and spaces, nothing else", () => {
  const cases: Array<[string, string]> = [
    ["lox_nexus", "lox_nexus"],
    ["lox nexus", "lox\\ nexus"],
    ["a,b", "a\\,b"],
    ["a=b", "a=b"],
    ["say \"hi\"", "say\\ \"hi\""],
    ["two\nlines", "two\\ lines"],
    ["back\\slash", "back\\\\slash"],
    ["tab\there", "tab\\ here"]
  ]
  for (const [input, expected] of cases) assert.equal(LineProtocol.measurement(input), expected, input)
})

test("tag keys and values escape backslashes, commas, equal signs and spaces; control characters become spaces", () => {
  const cases: Array<[string, string]> = [
    ["Living room", "Living\\ room"],
    ["a,b=c d", "a\\,b\\=c\\ d"],
    ["loxone/home/in/t", "loxone/home/in/t"],
    ["quote\"d", "quote\"d"],
    ["Küche 🌡", "Küche\\ 🌡"],
    ["a\r\nb\nc", "a\\ b\\ c"],
    ["C:\\temp\\", "C:\\\\temp\\\\"],
    ["a\\,b", "a\\\\\\,b"],
    ["a\\ b", "a\\\\\\ b"],
    ["a\\=b", "a\\\\\\=b"],
    ["tab\tnul\u0000del\u007f", "tab\\ nul\\ del\\ "]
  ]
  for (const [input, expected] of cases) assert.equal(LineProtocol.tagPart(input), expected, input)
})

test("string fields are quoted with backslashes and double quotes escaped", () => {
  const cases: Array<[string, string]> = [
    ["eco", "\"eco\""],
    ["say \"hi\"", "\"say \\\"hi\\\"\""],
    ["C:\\temp\\", "\"C:\\\\temp\\\\\""],
    ["a, b=c", "\"a, b=c\""],
    ["", "\"\""]
  ]
  for (const [input, expected] of cases) assert.equal(LineProtocol.string(input), expected, input)
})

test("numbers are floats, booleans true/false, and non-finite numbers can't be written", () => {
  assert.equal(LineProtocol.value(21.5), "21.5")
  assert.equal(LineProtocol.value(21), "21")
  assert.equal(LineProtocol.value(-0.001), "-0.001")
  assert.equal(LineProtocol.value(1e21), "1e+21")
  assert.equal(LineProtocol.value(true), "true")
  assert.equal(LineProtocol.value(false), "false")
  assert.equal(LineProtocol.value(Number.NaN), undefined)
  assert.equal(LineProtocol.value(Infinity), undefined)
})

test("a whole line: sorted tags, empty tags left out, ms timestamp", () => {
  const line = LineProtocol.line(point({
    measurement: "lox nexus",
    tags: { value_type: "string", signal_id: "s 1", label: "", topic: "a,b" },
    fields: { text: "on \"eco\"", forced: true },
    ts: 1_700_000_000_123.6
  }))
  assert.equal(line, "lox\\ nexus,signal_id=s\\ 1,topic=a\\,b,value_type=string text=\"on \\\"eco\\\"\",forced=true 1700000000124")
})

test("a backslash at the end of a tag value can't swallow the separator", () => {
  const line = LineProtocol.line(point({ tags: { label: "C:\\", topic: "x" } }))
  assert.equal(line, "m,label=C:\\\\,topic=x value=1 1700000000000")
})

test("non-finite fields are left out, and a point with none left gives no line", () => {
  assert.equal(LineProtocol.line(point({ fields: { red: 1, green: Number.NaN } })), "m red=1 1700000000000")
  assert.equal(LineProtocol.line(point({ fields: { value: Number.NaN } })), undefined)
  assert.equal(LineProtocol.line(point({ fields: {} })), undefined)
})
