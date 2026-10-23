import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { HealthMonitor, type MiniserverHealth } from "./HealthMonitor.ts"

test("health goes waiting → online → stale → stopped", async () => {
  mock.timers.enable({ apis: ["setInterval"] })
  try {
    let now = 0
    const changes: MiniserverHealth[] = []
    const monitor = new HealthMonitor({ now: () => now }, health => changes.push(health))
    assert.equal(monitor.health, "waiting")
    monitor.seen()
    now += HealthMonitor.STALE_AFTER_MS + 1
    mock.timers.tick(HealthMonitor.CHECK_EVERY_MS)
    await monitor.dispose()
    assert.deepEqual(changes, ["online", "stale", "stopped"])
  } finally {
    mock.timers.reset()
  }
})
