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
