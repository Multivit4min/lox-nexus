import assert from "node:assert/strict"
import path from "node:path"
import { test } from "node:test"
import type { HistorySeriesDto, LoxoneSignalDto, MiniserverDto } from "@lox-nexus/api"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { TestApp } from "../test-support/TestApp.ts"
import { HistoryAssembly } from "./HistoryAssembly.ts"

const loxone = { source: { kind: "loxone" as const, id: "haus" } }
const MINUTE = 60_000

test("the time a signal is out of the selection is a gap, also when its value never changed", { timeout: 10_000 }, async t => {
  let later = 0
  const app = await TestApp.start({ databaseFile: path.join(TestApp.tempDir(), "nexus.db"), clock: { now: () => Date.now() + later } })
  t.after(() => app.dispose())
  const admin = await app.admin()
  const ms = (await admin.post("/api/miniservers", { slug: "haus", label: "Haus", host: "127.0.0.1", port: 1, listenPort: 2, ownId: "nexus", remoteId: "ms", enabled: false })).json<MiniserverDto>()
  const temp = (await admin.post(`/api/miniservers/${ms.id}/signals`, { packetId: "temp", direction: "in", dataType: 1, label: "temp" })).json<LoxoneSignalDto>()
  const { bus, history, selections } = app.app
  const now = () => Date.now() + later
  // in minute steps with a write each, so the recorder doesn't take the moves for a clock jump
  const pass = (minutes: number) => {
    for (let i = 0; i < minutes; i++) {
      later += MINUTE
      history.recorder.flush()
    }
  }
  const start = now()
  selections.setRule(HistoryAssembly.CONSUMER, { signalId: temp.id }, true)
  bus.publish(temp.topic, Value.number(21), loxone)
  pass(10)
  const stopped = now()
  selections.setRule(HistoryAssembly.CONSUMER, { signalId: temp.id }, false)
  pass(20)
  const resumed = now()
  selections.setRule(HistoryAssembly.CONSUMER, { signalId: temp.id }, true)
  pass(5)
  assert.equal(history.recorder.flush(true), true)

  const series = (await admin.get(`/api/history/signals/${temp.id}?from=${start}&to=${now()}&points=100`)).json<HistorySeriesDto>()
  assert.equal(series.gaps.length, 1)
  assert.ok(Math.abs(series.gaps[0]!.from - stopped) < 1000 && Math.abs(series.gaps[0]!.to - resumed) < 1000, JSON.stringify(series.gaps))
  const raw = series.resolution === "raw" ? series.points.map(point => "v" in point ? point.v : undefined) : []
  assert.deepEqual(raw, [21, 21], "recording resumed with the current value")
})
