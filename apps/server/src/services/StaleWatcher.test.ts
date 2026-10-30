import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { test, type TestContext } from "node:test"
import type { StaleSignalDto } from "@lox-nexus/api"
import type { Signal } from "@lox-nexus/core"
import { StaleWatcher } from "./StaleWatcher.ts"

const MIN = 60_000

const input = (id: string, extra: Partial<Signal> = {}): Signal =>
  ({ id, topic: `loxone/haus/in/${id}`, label: id, direction: "source", valueType: "number", delivery: "state", owner: { kind: "miniserver", id: "ms" }, ...extra })

function setup(t: TestContext) {
  let now = 1_000_000
  const seen = new Map<string, number>()
  const active = new Set(["miniserver:ms", "plugin:p"])
  const signals: Signal[] = [input("t", { staleAfterMin: 5 }), input("free"), input("out", { direction: "target", staleAfterMin: 1 })]
  const registry = Object.assign(new EventEmitter(), { list: () => signals })
  const watcher = new StaleWatcher({
    signals: registry, bus: { lastSeen: topic => seen.get(topic) }, clock: { now: () => now },
    active: owner => active.has(`${owner.kind}:${owner.id}`)
  })
  t.after(() => watcher.dispose())
  const heard: StaleSignalDto[][] = []
  watcher.onChange(stale => heard.push(stale))
  return { watcher, signals, registry, seen, active, heard, advance: (ms: number) => (now += ms), now: () => now }
}

test("a source is stale after its minutes without a value, counted from when its owner became active", t => {
  const { watcher, seen, heard, advance, now } = setup(t)
  watcher.check()
  advance(4 * MIN)
  watcher.check()
  assert.deepEqual(watcher.list(), [], "not yet: the owner only just became active")
  advance(MIN)
  watcher.check()
  assert.deepEqual(watcher.list(), [{ signalId: "t", topic: "loxone/haus/in/t" }], "never seen in 5 minutes; targets and signals without a limit never")
  seen.set("loxone/haus/in/t", now())
  watcher.check()
  assert.deepEqual(watcher.list(), [], "a value, also an unchanged one, ends it")
  advance(5 * MIN)
  watcher.check()
  assert.deepEqual(watcher.list(), [{ signalId: "t", topic: "loxone/haus/in/t", lastSeen: now() - 5 * MIN }])
  assert.equal(heard.length, 3, "listeners hear changes only")
})

test("a signal added to a long-running owner, or moved to another topic, gets its full time", t => {
  const { watcher, signals, registry, advance } = setup(t)
  watcher.check()
  advance(60 * MIN)
  signals.push(input("late", { staleAfterMin: 5 }))
  registry.emit("registered")
  assert.deepEqual(watcher.list().map(entry => entry.signalId), ["t"], "checked at once on the change; the new one isn't stale yet")
  advance(5 * MIN)
  watcher.check()
  assert.deepEqual(watcher.list().map(entry => entry.signalId), ["t", "late"])
  signals[0] = input("t", { staleAfterMin: 5, topic: "loxone/haus/in/renamed" })
  registry.emit("updated")
  assert.deepEqual(watcher.list().map(entry => entry.signalId), ["late"], "the move starts its time over")
})

test("an inactive owner's signals aren't stale, and its clock starts over when it is back", t => {
  const { watcher, signals, active, advance } = setup(t)
  signals.push(input("pv", { staleAfterMin: 1, owner: { kind: "plugin", id: "p" } }))
  watcher.check()
  advance(10 * MIN)
  active.clear()
  watcher.check()
  assert.deepEqual(watcher.list(), [], "an offline Miniserver or degraded instance shows that itself")
  active.add("miniserver:ms")
  active.add("plugin:p")
  watcher.check()
  advance(4 * MIN)
  watcher.check()
  assert.deepEqual(watcher.list().map(entry => entry.signalId), ["pv"], "back for 4 minutes: only the plugin's 1-minute limit is over")
})

test("activeIn: a Miniserver while online, a plugin instance while running", () => {
  const active = StaleWatcher.activeIn(
    { get: id => (id === "on" ? { health: "online" } : { health: "stale" }) as never },
    { get: id => ({ state: id === "p" ? "running" : "degraded" }) as never }
  )
  assert.deepEqual([active({ kind: "miniserver", id: "on" }), active({ kind: "miniserver", id: "off" })], [true, false])
  assert.deepEqual([active({ kind: "plugin", id: "p" }), active({ kind: "plugin", id: "x" })], [true, false])
})
