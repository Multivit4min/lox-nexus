import assert from "node:assert/strict"
import { afterEach, describe, test } from "node:test"
import type { PluginLogger } from "@lox-nexus/plugin-sdk"
import { ScriptHarness } from "../test-support/ScriptHarness.ts"
import { ScriptLog } from "./ScriptLog.ts"

describe("console", () => {
  const harness = new ScriptHarness()
  afterEach(() => harness.cleanup())

  test("each method writes one line at the matching level", async () => {
    const host = await harness.start(`
      console.log("log", 1, true, null, undefined)
      console.info("info", { a: 1, list: [1, "two"] })
      console.debug("debug", 10n, Symbol("s"), function named() {})
      console.warn("warn", [1, 2])
      const circular = {}; circular.self = circular
      console.error("error", circular)
    `)
    const lines = host.sent.flatMap(message => (message.type === "log" ? [[message.level, message.message]] : []))
    assert.deepEqual(lines, [
      ["info", "log 1 true null undefined"],
      ["info", "info {\n  \"a\": 1,\n  \"list\": [\n    1,\n    \"two\"\n  ]\n}"],
      ["debug", "debug 10n Symbol(s) [function named]"],
      ["warn", "warn [\n  1,\n  2\n]"],
      ["error", "error [object Object] (not serialisable as JSON)"]
    ])
  })

  test("errors are written with the script's frames only", async () => {
    const host = await harness.start("function fail() {\n  throw new TypeError(\"boom\")\n}\ntry { fail() } catch (error) { console.error(\"caught:\", error) }")
    assert.deepEqual(ScriptHarness.logs(host, "error"), ["caught: TypeError: boom\n    at fail (script.js:2:9)\n    at script.js:4:7"])
  })
})

describe("ScriptLog", () => {
  test("drops lines beyond the budget and reports how many in the next window", () => {
    const lines: string[] = []
    const log = Object.fromEntries(["debug", "info", "warn", "error"].map(level => [level, (message: string) => void lines.push(`${level} ${message}`)])) as unknown as PluginLogger
    let now = 0
    const scriptLog = new ScriptLog(log, () => now)
    for (let i = 0; i < ScriptLog.LIMIT + 5; i++) scriptLog.write("info", `line ${i}`)
    assert.equal(lines.length, ScriptLog.LIMIT)
    now += ScriptLog.WINDOW_MS
    scriptLog.write("info", "x".repeat(ScriptLog.MAX_LENGTH + 1))
    assert.equal(lines.at(-2), `warn 5 script log lines dropped: more than ${ScriptLog.LIMIT} in 10 s`)
    assert.equal(lines.at(-1), `info ${"x".repeat(ScriptLog.MAX_LENGTH)}… (clipped)`)
  })

  test("formats a line only when it fits the budget, and clips the stack", () => {
    const data: unknown[] = []
    const log = { debug() {}, info() {}, warn() {}, error: (_: string, stack: unknown) => void data.push(stack) } as PluginLogger
    const scriptLog = new ScriptLog(log, () => 0)
    let formatted = 0
    for (let i = 0; i < ScriptLog.LIMIT + 10; i++) scriptLog.write("error", () => `line ${++formatted}`, { stack: "s".repeat(ScriptLog.MAX_LENGTH + 1) })
    assert.equal(formatted, ScriptLog.LIMIT)
    assert.deepEqual(data[0], { stack: `${"s".repeat(ScriptLog.MAX_LENGTH)}… (clipped)` })
  })

  test("debug lines are skipped while the instance keeps no debug lines, and leave the budget to the others", () => {
    const lines: string[] = []
    const log = Object.fromEntries(["debug", "info", "warn", "error"].map(level => [level, (message: string) => void lines.push(`${level} ${message}`)])) as unknown as PluginLogger
    const level = { current: "info" as "info" | "debug" }
    const scriptLog = new ScriptLog(log, () => 0, level)
    for (let i = 0; i < ScriptLog.LIMIT * 2; i++) scriptLog.write("debug", () => assert.fail("a skipped line is not formatted"))
    scriptLog.write("info", "still logged")
    assert.deepEqual(lines, ["info still logged"])
    level.current = "debug"
    scriptLog.write("debug", "now kept")
    assert.equal(lines.at(-1), "debug now kept")
  })
})
