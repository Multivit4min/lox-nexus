import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { IciId } from "./IciId.ts"

describe("IciId", () => {
  test("accepts 1–8 printable ASCII characters", () => {
    assert.equal(IciId.from("claude").value, "claude")
    assert.equal(IciId.from("12345678").value, "12345678")
  })

  test("rejects ids that would be truncated or corrupted (review #14)", () => {
    for (const bad of ["", "123456789", "küche", "a\u0000b"]) {
      assert.throws(() => IciId.from(bad), RangeError, bad)
    }
  })

  test("reads up to the first NUL and writes zero-padded", () => {
    const buffer = Buffer.alloc(16)
    IciId.from("rand").write(buffer, 4)
    assert.equal(buffer.subarray(4, 12).toString("hex"), "72616e6400000000")
    assert.equal(IciId.read(buffer, 4), "rand")
  })

  test("reads a full 8 byte id without terminator", () => {
    assert.equal(IciId.read(Buffer.from("abcdefghXYZ"), 0), "abcdefgh")
  })
})
