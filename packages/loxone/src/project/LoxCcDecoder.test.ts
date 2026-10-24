import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { ProjectFixtures } from "../test-support/ProjectFixtures.ts"
import { LoxCcDecoder } from "./LoxCcDecoder.ts"

/** header + raw block, with the sizes a real file would declare */
function file(block: number[], size: number, compressed = block.length) {
  const header = Buffer.alloc(16)
  header.writeUInt32LE(LoxCcDecoder.MAGIC, 0)
  header.writeUInt32LE(compressed, 4)
  header.writeUInt32LE(size, 8)
  return Buffer.concat([header, Buffer.from(block)])
}

const ascii = (text: string) => [...Buffer.from(text)]

describe("LoxCcDecoder", () => {
  test("literals only, including lengths that need extra bytes (15, 270, 600)", () => {
    for (const length of [0, 1, 14, 15, 270, 600]) {
      const data = Buffer.alloc(length, "x")
      assert.deepEqual(LoxCcDecoder.decode(ProjectFixtures.loxcc(data)), data)
    }
  })

  test("a back-reference copies earlier output", () => {
    // "abcd", then 4 bytes from 4 back, then the literal-only final sequence "!"
    const block = [0x40, ...ascii("abcd"), 4, 0, 0x10, ...ascii("!")]
    assert.equal(LoxCcDecoder.decode(file(block, 9)).toString(), "abcdabcd!")
  })

  test("an overlapping back-reference repeats a run, and a long match length uses extra bytes", () => {
    // "ab", then 15 + 4 + 3 = 22 bytes from 2 back
    const block = [0x2f, ...ascii("ab"), 2, 0, 3]
    assert.equal(LoxCcDecoder.decode(file(block, 24)).toString(), "ab".repeat(12))
  })

  test("rejects a wrong magic, a short file and a truncated block", () => {
    const good = ProjectFixtures.loxcc(Buffer.from("hello"))
    const wrongMagic = Buffer.from(good)
    wrongMagic.writeUInt32LE(0x12345678, 0)
    assert.throws(() => LoxCcDecoder.decode(wrongMagic), /wrong magic/)
    assert.throws(() => LoxCcDecoder.decode(good.subarray(0, 10)), /too short/)
    assert.throws(() => LoxCcDecoder.decode(good.subarray(0, good.length - 1)), /truncated/)
  })

  test("rejects sizes that don't match and references before the start", () => {
    assert.throws(() => LoxCcDecoder.decode(file([0x30, ...ascii("abc")], 4)), /3 bytes, the header says 4/)
    assert.throws(() => LoxCcDecoder.decode(file([0x30, ...ascii("abc")], 2)), /longer than its header/)
    assert.throws(() => LoxCcDecoder.decode(file([0x20, ...ascii("ab"), 5, 0, 0x00], 6)), /before its start/)
    assert.throws(() => LoxCcDecoder.decode(file([0x20, ...ascii("ab"), 0, 0, 0x00], 6)), /before its start/)
  })

  test("refuses a header that claims an absurd size before allocating it", () => {
    assert.throws(() => LoxCcDecoder.decode(file([0x00], LoxCcDecoder.MAX_OUTPUT_BYTES + 1)), /more than allowed/)
    // 2 bytes of LZ4 can't become a megabyte
    assert.throws(() => LoxCcDecoder.decode(file([0x00, 0x00], 1024 * 1024)), /more than LZ4 can expand to/)
  })
})
