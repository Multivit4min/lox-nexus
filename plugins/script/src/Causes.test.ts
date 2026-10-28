import assert from "node:assert/strict"
import { afterEach, describe, test } from "node:test"
import type { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { ScriptHarness } from "./test-support/ScriptHarness.ts"

const { until } = ScriptHarness

/** the cause of each value a signal emitted, "" for none */
function causes(host: PluginTestHost, signalId: string) {
  return host.sent.flatMap(message => (message.type === "emit" && message.signalId === signalId ? [message.causeId ?? ""] : []))
}

describe("causes", () => {
  const harness = new ScriptHarness()
  afterEach(() => harness.cleanup())

  // real timers: faked ones don't carry async context, so they couldn't show a cause leaking
  test("an interval started by a command doesn't carry the command's cause", async () => {
    const host = await harness.start("let n = 0\nnexus.on(\"start\", () => {\n  nexus.set(\"tick\", n++)\n  setInterval(() => nexus.set(\"tick\", n++), 120)\n})")
    const tick = await host.addSensor("number", { name: "tick" })
    await host.actuate(await host.addActuator("switch", { name: "start" }), Value.boolean(true), "command-1")
    await until(() => host.values(tick).length >= 3)
    assert.deepEqual(causes(host, tick).slice(0, 3), ["command-1", "", ""])
  })

  test("a trailing value of the throttle carries the cause of the call that set it", async () => {
    const host = await harness.start("nexus.on(\"in\", value => nexus.set(\"out\", value))")
    const out = await host.addSensor("number", { name: "out" })
    const input = await host.addActuator("number", { name: "in" })
    await host.actuate(input, Value.number(1), "first")
    await host.actuate(input, Value.number(2), "second")
    await until(() => host.values(out).length === 2)
    assert.deepEqual(causes(host, out), ["first", "second"])
  })
})
