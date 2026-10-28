import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { JsonPath } from "./JsonPath.ts"

const resolve = (path: string, data: unknown) => JsonPath.parse(path).resolve(data)

describe("JsonPath", () => {
  test("parses names and indexes", () => {
    assert.deepEqual(JsonPath.parse("a.b[0].c").segments, ["a", "b", 0, "c"])
    assert.deepEqual(JsonPath.parse("[2][1]").segments, [2, 1])
    assert.deepEqual(JsonPath.parse("sensor-1.temp_c").segments, ["sensor-1", "temp_c"])
    assert.deepEqual(JsonPath.parse("a b.c").segments, ["a b", "c"])
  })

  test("refuses malformed paths with a reason", () => {
    for (const path of ["", "a..b", ".a", "a.", "a[", "a[x]", "a[-1]", "a]", "a.[0]", "a[0]b", "x".repeat(201)]) {
      assert.throws(() => JsonPath.parse(path), Error, path)
      assert.ok(JsonPath.problem(path), path)
    }
    assert.equal(JsonPath.problem("a.b"), undefined)
  })

  test("refuses prototype keys wherever they are", () => {
    for (const path of ["__proto__", "a.__proto__.b", "constructor", "a.constructor.prototype", "x.prototype"]) {
      assert.throws(() => JsonPath.parse(path), /isn't allowed/, path)
    }
    assert.doesNotThrow(() => JsonPath.parse("protos.constructors"))
  })

  test("resolves into objects and arrays", () => {
    const data = { a: { b: [{ c: 21.5 }, { c: null }] }, list: [1, 2, 3], flag: false }
    assert.deepEqual(resolve("a.b[0].c", data), { found: true, value: 21.5 })
    assert.deepEqual(resolve("a.b[1].c", data), { found: true, value: null })
    assert.deepEqual(resolve("list.2", data), { found: true, value: 3 }, "a numeric name indexes an array")
    assert.deepEqual(resolve("flag", data), { found: true, value: false })
    assert.deepEqual(resolve("a.b", data), { found: true, value: data.a.b })
    assert.deepEqual(resolve("[1]", [10, 20]), { found: true, value: 20 })
  })

  test("reports missing values as not found", () => {
    const data = { a: { b: [1] }, s: "text" }
    for (const path of ["x", "a.c", "a.b[1]", "a.b.x", "a[0]", "s.length", "s[0]", "a.b.length"]) {
      assert.deepEqual(resolve(path, data), { found: false }, path)
    }
    assert.deepEqual(resolve("a", null), { found: false })
    assert.deepEqual(resolve("a", 5), { found: false })
  })

  test("only follows own properties", () => {
    assert.deepEqual(resolve("toString", {}), { found: false })
    assert.deepEqual(resolve("hasOwnProperty", { a: 1 }), { found: false })
    // JSON.parse makes "__proto__" an own key; the parser refuses it anyway
    assert.throws(() => resolve("__proto__.x", JSON.parse("{\"__proto__\":{\"x\":1}}")))
  })
})
