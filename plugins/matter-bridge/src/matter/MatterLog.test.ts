import assert from "node:assert/strict"
import { test } from "node:test"
import type { PluginLogLevel } from "@lox-nexus/plugin-sdk"
import { Logger, LogLevel } from "@matter/main"
import { MatterLog } from "./MatterLog.ts"

test("matter.js produces its info lines only while the instance keeps debug lines, and follows a change", () => {
  let listener: (level: PluginLogLevel["current"]) => void = () => {}
  const level: PluginLogLevel = { current: "info", onChange: next => ((listener = next), () => (listener = () => {})) }
  const silent = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
  const before = new Set(Object.keys(Logger.destinations))
  const uninstall = new MatterLog(silent, level).install()
  const name = Object.keys(Logger.destinations).find(key => !before.has(key))!
  assert.equal(Logger.destinations[name]?.level, LogLevel.NOTICE)
  listener("debug")
  assert.equal(Logger.destinations[name]?.level, LogLevel.INFO)
  uninstall()
  assert.equal(name in Logger.destinations, false)
  listener("info")
})
