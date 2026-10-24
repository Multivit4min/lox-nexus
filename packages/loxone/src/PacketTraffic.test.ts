import assert from "node:assert/strict"
import { test } from "node:test"
import { PacketTraffic } from "./PacketTraffic.ts"

test("tracks at most MAX_PACKETS packet ids, and prune() frees the idle ones", () => {
  let now = 0
  const traffic = new PacketTraffic({ now: () => now }, 10)
  for (let i = 0; i < PacketTraffic.MAX_PACKETS + 5; i++) traffic.count("in", `p${i}`)
  assert.equal(traffic.total("in", `p${PacketTraffic.MAX_PACKETS}`), 0, "a flood of new ids is not tracked")
  assert.equal(traffic.total("in", "p0"), 1)
  now = 20_000
  traffic.prune()
  traffic.count("out", "late")
  assert.equal(traffic.total("out", "late"), 1, "room again once the idle ones are gone")
})
