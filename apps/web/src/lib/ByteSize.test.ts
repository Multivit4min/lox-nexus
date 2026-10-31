import assert from "node:assert/strict"
import { test } from "node:test"
import { ByteSize } from "./ByteSize.ts"

test("sizes read in bytes, KiB and MiB", () => {
  assert.deepEqual([ByteSize.format(412), ByteSize.format(3482), ByteSize.format(1_258_291)], ["412 B", "3.4 KiB", "1.2 MiB"])
})
