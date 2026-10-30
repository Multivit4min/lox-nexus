import assert from "node:assert/strict"
import { test } from "node:test"
import { Actuator } from "../plugin/Actuator.ts"
import { Plugin } from "../plugin/Plugin.ts"
import { PluginTestHost } from "../testing/PluginTestHost.ts"
import type { Value } from "../values/Value.ts"

test("an actuator reports a failure on its own signal once, cut to size; recover() clears it once; nothing after dispose", async () => {
  class Switch extends Actuator<SwitchPlugin, object, Value> {
    static readonly id = "switch"
    static readonly accepts = "number"
    override start() {
      this.plugin.next = step => (step === "fail" ? this.fail("device removed") : step === "long" ? this.fail("x".repeat(20_000)) : this.recover())
    }
    run() {}
  }
  class SwitchPlugin extends Plugin {
    static readonly actuators = [Switch]
    next: (step: "fail" | "long" | "recover") => void = () => {}
  }
  const host = await PluginTestHost.start(SwitchPlugin)
  const id = await host.addActuator("switch")
  for (const step of ["recover", "fail", "fail", "recover", "recover", "long"] as const) host.plugin.next(step)
  await host.stop()
  host.plugin.next("fail")
  const status = host.sent.filter(message => message.type === "signal.error" || message.type === "signal.recovered")
  assert.deepEqual(status.slice(0, 2), [{ type: "signal.error", signalId: id, error: "device removed" }, { type: "signal.recovered", signalId: id }], "the same failure is sent once")
  const long = status[2]
  assert.equal(long?.type === "signal.error" && long.error.length, 10_000, "cut to what the host accepts")
  assert.equal(status.length, 3, "nothing after dispose")
})
