import assert from "node:assert/strict"
import { test } from "node:test"
import { StartFailure } from "./StartFailure.ts"

test("a taken port is named, also when the socket error is wrapped", () => {
  const wrapped = new Error("network startup failed", { cause: Object.assign(new Error("bind failed"), { code: "EADDRINUSE" }) })
  assert.match(new StartFailure(wrapped, 5540).message, /^UDP port 5540 is in use/)
  assert.match(new StartFailure(new AggregateError([new Error("Cannot bind {::}:5540 because port is already in use")]), 5540).message, /^UDP port 5540 is in use/)
  assert.match(new StartFailure(Object.assign(new Error("x"), { code: "EACCES" }), 80).message, /above 1024/)
  assert.equal(new StartFailure("odd", 5540).message, "the Matter bridge could not start: odd")
})
