import assert from "node:assert/strict"
import { test } from "node:test"
import { greet } from "./index"

test("greet baut den Gruss", () => {
  assert.equal(greet("Welt"), "Hello, Welt!")
})
