import assert from "node:assert/strict"
import { test } from "node:test"
import type { WireDto } from "@lox-nexus/api"
import { WiredSignals } from "./WiredSignals.ts"

const wire = (id: string, sourceId: string, targetId: string): WireDto =>
  ({ id, label: id, sourceId, targetId, transforms: [], enabled: true, syncOnStart: false, active: true })

test("each signal knows the wires it feeds and the one feeding it", async () => {
  const wired = new WiredSignals({ list: async () => [wire("w1", "pv", "out1"), wire("w2", "pv", "out2"), wire("w3", "in", "light")] })
  assert.deepEqual(wired.of("pv"), { out: [], in: [] }, "nothing before a load")
  await wired.load()
  assert.deepEqual(wired.of("pv").out.map(w => w.id), ["w1", "w2"])
  assert.deepEqual(wired.of("light").in.map(w => w.id), ["w3"])
  assert.deepEqual(wired.of("other"), { out: [], in: [] })
})

test("only the latest load applies, and a failing one keeps what was there", async () => {
  const answers: Array<(wires: WireDto[]) => void> = []
  let fail = false
  const wired = new WiredSignals({ list: () => (fail ? Promise.reject(new Error("offline")) : new Promise(resolve => answers.push(resolve))) })
  const slow = wired.load()
  const fresh = wired.load()
  answers[1]!([wire("new", "a", "b")])
  answers[0]!([wire("old", "a", "b")])
  await Promise.all([slow, fresh])
  assert.deepEqual(wired.of("a").out.map(w => w.id), ["new"])
  fail = true
  await wired.load()
  assert.deepEqual(wired.of("a").out.map(w => w.id), ["new"])
})
