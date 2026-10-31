import assert from "node:assert/strict"
import { test } from "node:test"
import { ClockOffset } from "./ClockOffset.ts"

test("the offset comes from the shortest round trip, with the server's time taken as its midpoint", async () => {
  // browser times of the requests and answers: trips of 400, 40 and 200 ms; the server is 3 s ahead
  const browser = [1000, 1400, 2000, 2040, 3000, 3200]
  let call = 0
  const offset = new ClockOffset(async () => browser[call - 1]! + (call === 3 ? 20 : 100) + 3000, () => browser[call++]!)
  assert.deepEqual(await offset.measure(3), { offsetMs: 3000, uncertaintyMs: 20 })
})

test("an offset reads as ahead, behind or in step", () => {
  assert.equal(ClockOffset.describe({ offsetMs: 3200, uncertaintyMs: 10 }), "3.2 s ahead of this browser")
  assert.equal(ClockOffset.describe({ offsetMs: -45_000, uncertaintyMs: 10 }), "45 s behind this browser")
  assert.equal(ClockOffset.describe({ offsetMs: 60, uncertaintyMs: 10 }), "in step with this browser")
  assert.equal(ClockOffset.describe({ offsetMs: 300, uncertaintyMs: 400 }), "in step with this browser", "within what the measurement can tell")
})
