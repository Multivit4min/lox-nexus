import assert from "node:assert/strict"
import { afterEach, describe, mock, test } from "node:test"
import type { PluginLogger } from "@lox-nexus/plugin-sdk"
import { AuthWarnings } from "./AuthWarnings.ts"

class RecordingLog implements PluginLogger {
  readonly lines: { message: string; data: unknown }[] = []
  debug() {}
  info() {}
  error() {}
  warn(message: string, data?: unknown) {
    this.lines.push({ message, data })
  }
}

describe("AuthWarnings", () => {
  afterEach(() => mock.timers.reset())

  test("warns at once, then at most once a minute with the count", async () => {
    mock.timers.enable({ apis: ["setTimeout"] })
    const log = new RecordingLog()
    const warnings = new AuthWarnings(log)
    warnings.note("wrong", true)
    assert.equal(log.lines.length, 1)
    assert.match(log.lines[0]?.message ?? "", /wrong token/)
    for (let i = 0; i < 500; i++) warnings.note(i % 2 ? "wrong" : "missing", true)
    assert.equal(log.lines.length, 1, "a flood within the minute adds no lines")
    mock.timers.tick(60_000)
    assert.equal(log.lines.length, 2)
    assert.match(log.lines[1]?.message ?? "", /^500 more/)
    assert.deepEqual(log.lines[1]?.data, { wrong: 250, missing: 250 })
    mock.timers.tick(60_000)
    assert.equal(log.lines.length, 2, "a quiet minute closes the window without a line")
    warnings.note("missing", true)
    assert.equal(log.lines.length, 3, "after a quiet minute the next one is logged at once")
    await warnings.dispose()
    warnings.note("wrong", true)
    assert.equal(log.lines.length, 3)
  })

  test("logs whether the hook exists, never the path (a mistyped URL may hold the token)", () => {
    mock.timers.enable({ apis: ["setTimeout"] })
    const log = new RecordingLog()
    const warnings = new AuthWarnings(log)
    warnings.note("wrong", false)
    assert.deepEqual(log.lines[0]?.data, { knownHook: false })
    void warnings.dispose()
  })
})
