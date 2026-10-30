import assert from "node:assert/strict"
import { test } from "node:test"
import { Plugin } from "../plugin/Plugin.ts"
import { PluginTestHost } from "../testing/PluginTestHost.ts"
import type { LogLevel, WorkerMessage } from "../wire/WorkerMessages.ts"
import { PluginRuntime } from "./PluginRuntime.ts"

class Chatty extends Plugin {
  readonly seen: LogLevel[] = []
  override start() {
    this.onDispose(this.logLevel.onChange(level => this.seen.push(level)))
  }
}

const lines = (host: PluginTestHost<typeof Chatty>) => host.sent.flatMap(message => (message.type === "log" ? [message.message] : []))

test("debug lines pass until the host keeps info only; the plugin sees the level change", async () => {
  const host = await PluginTestHost.start(Chatty)
  const { plugin } = host
  assert.equal(plugin.logLevel.current, "debug", "without a level from the host everything is sent, as older hosts expect")
  plugin.log.debug("one")
  await host.logLevel("info")
  plugin.log.debug("two")
  plugin.log.info("three")
  await host.logLevel("info")
  await host.logLevel("debug")
  plugin.log.debug("four")
  assert.deepEqual(lines(host), ["one", "three", "four"])
  assert.deepEqual(plugin.seen, ["info", "debug"], "an unchanged level is not announced")
  await host.stop()
})

test("the worker announces the feature in hello", () => {
  const sent: WorkerMessage[] = []
  new PluginRuntime(Chatty, message => sent.push(message)).hello()
  assert.deepEqual(sent, [{ type: "hello", version: 1, features: ["log.level"] }])
})

test("a throwing listener is logged, the others still hear it", async () => {
  class Throwing extends Chatty {
    override start() {
      this.logLevel.onChange(() => {
        throw new Error("boom")
      })
      super.start()
    }
  }
  const host = await PluginTestHost.start(Throwing)
  await host.logLevel("warn")
  assert.deepEqual(host.plugin.seen, ["warn"])
  assert.ok(lines(host).some(line => /listener threw: boom/.test(line)))
  await host.stop()
})
