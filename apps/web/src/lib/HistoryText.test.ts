import assert from "node:assert/strict"
import { test } from "node:test"
import { HistoryText } from "./HistoryText.ts"

const bucket = (avg: number, min: number, max: number) => ({ ts: 0, avg, min, max, last: avg, n: 3 })

test("history values take the signal's decimals and unit; a range names the unit once", () => {
  const display = { unit: "W", decimals: 1 }
  assert.equal(HistoryText.value(412.256, "number", display), (412.3).toLocaleString(undefined, { minimumFractionDigits: 1 }) + " W")
  assert.equal(HistoryText.value(null, "number", display), "–")
  assert.equal(HistoryText.value(1, "boolean", display), "on", "on/off has no unit")
  const range = HistoryText.bucket(bucket(400, 380, 450), "number", display)
  assert.equal(range, `${(400).toFixed(1)} (${(380).toFixed(1)} – ${(450).toFixed(1)} W)`)
  assert.equal(HistoryText.bucket(bucket(400, 400, 400), "number", display), `${(400).toFixed(1)} W`)
  assert.equal(HistoryText.value(2.5, "number"), (2.5).toLocaleString(), "without a display as before")
})
