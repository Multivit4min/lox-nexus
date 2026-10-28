import assert from "node:assert/strict"
import { test } from "node:test"
import { PartialWrite } from "./PartialWrite.ts"
import { RetryPolicy } from "./RetryPolicy.ts"

test("the dropped points of a partial write are read from 1.x and 3 answers", () => {
  const v1 = "{\"error\":\"partial write: field type conflict: input field \\\"value\\\" on measurement \\\"lox_nexus\\\" is type string, already exists as type float dropped=2\"}"
  assert.equal(PartialWrite.dropped(v1, 10), 2)
  const v3 = JSON.stringify({ error: "partial write of line protocol occurred", data: [{ original_line: "x", line_number: 2, error_message: "bad" }] })
  assert.equal(PartialWrite.dropped(v3, 10), 1)
  assert.equal(PartialWrite.dropped(v3.slice(0, 40), 10), undefined, "a body cut short can't be counted")
  assert.equal(PartialWrite.dropped(v1, 2), undefined, "all points dropped is a plain rejection")
  assert.equal(PartialWrite.dropped("unable to parse", 10), undefined)
})

test("a 400 partial write keeps the dropped count; other rejections don't have one", () => {
  const policy = new RetryPolicy("the token")
  assert.deepEqual(policy.answer({ status: 400, body: "partial write: x dropped=1" }, 0, 5), { kind: "reject", reason: "HTTP 400: partial write: x dropped=1", dropped: 1 })
  assert.deepEqual(policy.answer({ status: 422, body: "partial write: x dropped=1" }, 0, 5), { kind: "reject", reason: "HTTP 422: partial write: x dropped=1" })
})
