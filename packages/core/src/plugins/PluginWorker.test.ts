import assert from "node:assert/strict"
import { test } from "node:test"
import { PluginWorker } from "./PluginWorker.ts"

test("a bundle runs without any loader; only flags a worker accepts are kept", () => {
  const host = ["--conditions=@lox-nexus/source", "--import", "tsx", "--enable-source-maps", "--expose-gc", "--import=tsx/esm", "--test-reporter=spec"]
  assert.deepEqual(PluginWorker.execArgv("/data/plugins/fronius/1.0.0/dist/plugin.js", host), ["--conditions=@lox-nexus/source", "--enable-source-maps"])
  assert.deepEqual(PluginWorker.execArgv("file:///data/plugins/mqtt/plugin.mjs", host), ["--conditions=@lox-nexus/source", "--enable-source-maps"])
  // a flag and its value as two arguments go together or not at all
  assert.deepEqual(PluginWorker.execArgv("/p/plugin.js", ["--conditions", "x", "-C", "y", "--no-warnings"]), ["--no-warnings"])
})

test("a TypeScript entry (development) inherits the host's execArgv, tsx included", () => {
  assert.equal(PluginWorker.execArgv("/repo/plugins/fronius/src/index.ts", ["--import", "tsx"]), undefined)
  assert.equal(PluginWorker.execArgv("file:///repo/plugins/x/src/index.mts", ["--import", "tsx"]), undefined)
})
