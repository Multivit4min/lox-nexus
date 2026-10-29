import assert from "node:assert/strict"
import { test } from "node:test"
import { PasswordRules } from "./PasswordRules.ts"

test("a new password needs 8 to 256 characters and the same repetition", () => {
  assert.match(PasswordRules.problem("short", "short") ?? "", /at least 8/)
  assert.match(PasswordRules.problem("x".repeat(257), "x".repeat(257)) ?? "", /at most 256/)
  assert.match(PasswordRules.problem("long enough", "long enougj") ?? "", /don't match/)
  assert.equal(PasswordRules.problem("long enough", "long enough"), undefined)
})
