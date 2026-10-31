import assert from "node:assert/strict"
import { test } from "node:test"
import { PanelCells } from "./PanelCells.ts"
import { RelativeTime } from "./RelativeTime.ts"

test("times count down and up the way panels show them", () => {
  const now = 1_000_000_000
  assert.deepEqual([RelativeTime.until(now + 750_000, now), RelativeTime.until(now + 3_900_000, now), RelativeTime.until(now - 1, now)], ["in 12:30", "in 1 h 05 min", "now"])
  assert.deepEqual([RelativeTime.since(now - 45_000, now), RelativeTime.since(now - 180_000, now), RelativeTime.since(now - 90_000_000, now)], ["for 45 s", "for 3 min", "for 1 d 1 h"])
})

test("a cell's text joins its text and its time; a plain string stays as it is", () => {
  const now = 1_000_000_000
  assert.equal(PanelCells.text("412 W", now), "412 W")
  assert.equal(PanelCells.text({ text: "open", tone: "warn", until: now + 60_000 }, now), "open · in 1:00")
  assert.equal(PanelCells.text({ since: now - 120_000 }, now), "for 2 min")
  assert.equal(PanelCells.tone({ text: "x", tone: "ok" }), "ok")
})

test("cells sort naturally and by number, rows match every word of a search", () => {
  const sorted = ["Port 10", "Port 2", "port 1"].sort(PanelCells.compare)
  assert.deepEqual(sorted, ["port 1", "Port 2", "Port 10"])
  assert.deepEqual(["12 W", "-5 W", "3.5 W"].sort(PanelCells.compare), ["-5 W", "3.5 W", "12 W"])
  assert.equal(PanelCells.matches(["Kitchen", { text: "online", tone: "ok" }], "kit ONLINE"), true)
  assert.equal(PanelCells.matches(["Kitchen", "offline"], "kitchen online"), false)
})
