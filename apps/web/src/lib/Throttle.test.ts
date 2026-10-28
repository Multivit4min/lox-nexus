import assert from "node:assert/strict"
import { afterEach, beforeEach, mock, test } from "node:test"
import { Throttle } from "./Throttle.ts"

beforeEach(() => mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 }))
afterEach(() => mock.timers.reset())

test("runs at once, then at most once per gap however many requests come", () => {
  let runs = 0
  const throttle = new Throttle(2000, () => runs++)
  throttle.request()
  mock.timers.tick(0)
  assert.equal(runs, 1)
  for (let i = 0; i < 10; i++) throttle.request()
  mock.timers.tick(1999)
  assert.equal(runs, 1)
  mock.timers.tick(1)
  assert.equal(runs, 2)
  throttle.request()
  throttle.cancel()
  mock.timers.tick(5000)
  assert.equal(runs, 2, "a cancelled request doesn't run")
})
