import assert from "node:assert/strict"
import { test } from "node:test"
import { LoggerFactory } from "../logging/LoggerFactory.ts"
import { PluginLogs } from "./PluginLogs.ts"

const instance = { id: "i1", slug: "home" }

function logs() {
  let now = 1000
  return new PluginLogs(LoggerFactory.silent(), { now: () => now++ })
}

test("keeps the last LINES_KEPT lines per instance, oldest first, with their time", () => {
  const buffer = logs()
  for (let i = 0; i < PluginLogs.LINES_KEPT + 5; i++) buffer.log(instance, "info", `line ${i}`)
  buffer.log({ id: "i2", slug: "other" }, "warn", "elsewhere")
  const lines = buffer.recent("i1")
  assert.equal(lines.length, PluginLogs.LINES_KEPT)
  assert.deepEqual([lines[0]!.message, lines.at(-1)!.message, lines[0]!.ts], ["line 5", `line ${PluginLogs.LINES_KEPT + 4}`, 1005])
  assert.deepEqual(buffer.recent("i2").map(line => [line.level, line.message]), [["warn", "elsewhere"]])
})

test("data becomes JSON; long messages and data are cut; data that can't be JSON is shown as text", () => {
  const buffer = logs()
  buffer.log(instance, "info", "plain")
  buffer.log(instance, "info", "x".repeat(5000), { big: "y".repeat(5000) })
  buffer.log(instance, "error", "odd", { n: 1n })
  const [plain, long, odd] = buffer.recent("i1")
  assert.equal("data" in plain!, false)
  assert.deepEqual([long!.message.length, long!.data!.length, long!.data!.startsWith("{\"big\":\"yyy")], [PluginLogs.MESSAGE_CHARS + 1, PluginLogs.DATA_CHARS + 1, true])
  assert.equal(odd!.data, "[object Object]")
})

test("recent returns a copy; forget drops an instance's lines", () => {
  const buffer = logs()
  buffer.log(instance, "info", "one")
  buffer.recent("i1").pop()
  assert.equal(buffer.recent("i1").length, 1)
  buffer.forget("i1")
  assert.deepEqual(buffer.recent("i1"), [])
})

test("debug lines are kept only while debug logging is on, which ends by itself; the ring grows meanwhile", t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] })
  const buffer = logs()
  const heard: string[] = []
  const stop = buffer.onLevel("i1", level => heard.push(level))
  buffer.log(instance, "debug", "dropped")
  assert.deepEqual(buffer.setLevel("i1", "debug", 2), { level: "debug", until: 2 * 60_000, remainingMs: 2 * 60_000 })
  assert.equal(buffer.level("i1"), "debug")
  for (let i = 0; i < PluginLogs.LINES_KEPT + 50; i++) buffer.log(instance, "debug", `detail ${i}`)
  assert.equal(buffer.recent("i1").length, PluginLogs.LINES_KEPT + 50)
  buffer.setLevel("i1", "debug", 2)
  t.mock.timers.tick(2 * 60_000)
  assert.deepEqual(buffer.levelOf("i1"), { level: "info" })
  assert.equal(buffer.recent("i1").length, PluginLogs.LINES_KEPT, "back to the normal ring, the newest lines stay")
  assert.equal(buffer.recent("i1").at(-1)?.message, `detail ${PluginLogs.LINES_KEPT + 49}`)
  assert.deepEqual(heard, ["debug", "info"], "extending it is no change")
  stop()
  buffer.setLevel("i1", "debug")
  assert.deepEqual(heard, ["debug", "info"])
  buffer.dispose()
})

test("a server log at debug already gets every plugin's debug lines; the ring still waits for the switch", () => {
  const verbose = LoggerFactory.silent()
  verbose.level = "debug"
  const buffer = new PluginLogs(verbose, { now: () => 0 })
  assert.equal(buffer.level("i1"), "debug")
  buffer.log(instance, "debug", "server log only")
  assert.deepEqual(buffer.recent("i1"), [])
})

test("forgetting an instance ends its debug logging; a throwing listener is logged, not thrown from the timer", t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] })
  const buffer = logs()
  buffer.onLevel("i1", () => {
    throw new Error("boom")
  })
  buffer.setLevel("i1", "debug", 1)
  t.mock.timers.tick(60_000)
  assert.deepEqual(buffer.levelOf("i1"), { level: "info" })
  buffer.setLevel("i2", "debug", 1)
  buffer.forget("i2")
  assert.deepEqual(buffer.levelOf("i2"), { level: "info" })
  buffer.dispose()
})
