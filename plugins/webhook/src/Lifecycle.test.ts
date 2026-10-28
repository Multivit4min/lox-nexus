import assert from "node:assert/strict"
import { test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { WebhookHarness } from "./test-support/WebhookHarness.ts"

const { call } = WebhookHarness

/** resource types active now beyond the baseline (counted per type) */
function added(baseline: string[]) {
  const left = new Map<string, number>()
  for (const type of baseline) left.set(type, (left.get(type) ?? 0) + 1)
  return process.getActiveResourcesInfo().filter(type => {
    const count = left.get(type) ?? 0
    left.set(type, count - 1)
    return count <= 0
  })
}

test("a stop/start cycle leaves no timers behind, and the next start works", async () => {
  const harness = new WebhookHarness()
  const baseline = process.getActiveResourcesInfo()
  try {
    for (let round = 0; round < 2; round++) {
      const host = await harness.start()
      const trigger = await host.addSensor("trigger", { hook: "bell", pulseMs: 3_600_000 })
      await host.addSensor("number", { hook: "bell", source: "query", name: "v" })
      assert.equal((await call(host, { hook: "bell", query: { v: "1" } })).status, 204)
      // opens the warning window, another timer that stop must clear
      assert.equal((await call(host, { hook: "bell", headers: { authorization: "Bearer nope" } })).status, 401)
      assert.deepEqual(host.values(trigger).at(-1), Value.boolean(true))
      assert.ok(added(baseline).includes("Timeout"), "the pulse and the warning window are running")
      await harness.cleanup()
      assert.deepEqual(added(baseline), [], `round ${round}`)
    }
  } finally {
    await harness.cleanup()
  }
})
