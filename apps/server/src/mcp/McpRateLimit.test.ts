import assert from "node:assert/strict"
import { test } from "node:test"
import { TestClock } from "@lox-nexus/plugin-sdk/testing"
import { McpRateLimit } from "./McpRateLimit.ts"

test("a token gets 120 calls a minute, refilled evenly; the refusal says how long to wait", async () => {
  const clock = new TestClock()
  const limit = new McpRateLimit(clock)
  for (let i = 0; i < 120; i++) (await limit.acquire("t1", false))()
  await assert.rejects(limit.acquire("t1", false), (error: { data?: { retryAfterS?: number } }) => error.data?.retryAfterS === 1)
  await assert.doesNotReject(limit.acquire("t2", false), "other tokens have their own")
  await clock.advance(1000)
  ;(await limit.acquire("t1", false))()
  await limit.dispose()
})

test("30 changing calls a minute, at most 4 at once, and changing calls one after the other", async () => {
  const clock = new TestClock()
  const limit = new McpRateLimit(clock)
  for (let i = 0; i < 30; i++) (await limit.acquire("t1", true))()
  await assert.rejects(limit.acquire("t1", true), /changing calls/)
  const held = await Promise.all([1, 2, 3, 4].map(() => limit.acquire("t2", false)))
  await assert.rejects(limit.acquire("t2", false), /at most 4 calls at once/)
  held.forEach(release => release())
  const first = await limit.acquire("t3", true)
  let secondRan = false
  const second = limit.acquire("t3", true).then(release => {
    secondRan = true
    release()
  })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(secondRan, false, "waits for the first")
  first()
  await second
  assert.equal(secondRan, true)
  await limit.dispose()
})
