import assert from "node:assert/strict"
import { test } from "node:test"
import { RandomToken } from "./RandomToken.ts"

test("48 hex characters, different every time", () => {
  const tokens = new Set(Array.from({ length: 50 }, () => RandomToken.create()))
  assert.equal(tokens.size, 50)
  for (const token of tokens) assert.match(token, /^[0-9a-f]{48}$/)
})
