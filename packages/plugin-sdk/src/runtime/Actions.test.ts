import assert from "node:assert/strict"
import { test } from "node:test"
import { z } from "zod"
import { Action } from "../plugin/Action.ts"
import { Plugin } from "../plugin/Plugin.ts"
import { PluginTestHost } from "../testing/PluginTestHost.ts"

class PairAction extends Action<PairingPlugin, { code: string }> {
  static readonly id = "pair"
  static readonly label = "Pair device"
  static readonly description = "Pairs a device by its code"
  static readonly input = z.object({ code: z.string().regex(/^\d{11}$/) })
  run() {
    this.plugin.paired.push(this.input.code)
    return `paired ${this.input.code}`
  }
}

class SlowAction extends Action<PairingPlugin> {
  static readonly id = "slow"
  static readonly confirm = "Really?"
  run() {
    this.onDispose(() => void this.plugin.events.push("slow disposed"))
    return new Promise<string>(resolve => {
      this.plugin.finishSlow = () => resolve("x".repeat(5000))
    })
  }
}

class PairingPlugin extends Plugin {
  static readonly actions = [PairAction, SlowAction]
  readonly paired: string[] = []
  readonly events: string[] = []
  finishSlow = () => {}
}

test("describe lists actions with their input schema; plugins without actions describe as before", async () => {
  const description = await PluginTestHost.describe(PairingPlugin)
  assert.deepEqual(description.actions?.map(action => [action.id, action.label, action.description, action.confirm, action.input.type]), [
    ["pair", "Pair device", "Pairs a device by its code", undefined, "object"],
    ["slow", "slow", undefined, "Really?", "object"]
  ])
  assert.equal("actions" in await PluginTestHost.describe(class Bare extends Plugin {}), false)
})

test("an action gets its validated input and answers with its message; invalid input and unknown ids fail", async () => {
  const host = await PluginTestHost.start(PairingPlugin)
  assert.equal(await host.action("pair", { code: "12345678901" }), "paired 12345678901")
  assert.deepEqual(host.plugin.paired, ["12345678901"])
  await assert.rejects(host.action("pair", { code: "12" }), /invalid input/)
  await assert.rejects(host.action("nope"), /unknown action "nope"/)
  await host.stop()
})

test("one action at a time; the answer is clipped; the action is disposed when it settles", async () => {
  const host = await PluginTestHost.start(PairingPlugin)
  const slow = host.action("slow")
  await assert.rejects(host.action("pair", { code: "12345678901" }), /slow is still running/)
  host.plugin.finishSlow()
  assert.equal((await slow)?.length, 2000)
  assert.deepEqual(host.plugin.events, ["slow disposed"])
  assert.equal(await host.action("pair", { code: "12345678901" }), "paired 12345678901")
  await host.stop()
})

test("stopping the plugin disposes a running action, which then fails", async () => {
  const host = await PluginTestHost.start(PairingPlugin)
  const plugin = host.plugin
  const slow = host.action("slow")
  const stopped = host.stop()
  plugin.finishSlow()
  await stopped
  await assert.rejects(slow, /the plugin stopped/)
  assert.deepEqual(plugin.events, ["slow disposed"])
})

test("two actions with one id are refused when the plugin starts", async () => {
  class Twice extends Plugin {
    static readonly actions = [PairAction, PairAction]
  }
  await assert.rejects(PluginTestHost.start(Twice), /two actions have the id "pair"/)
})

test("an answer JSON can't hold is refused instead of breaking the host", async () => {
  class BigPanel extends Plugin {
    override panel() {
      return { type: "json" as const, data: { fabric: 1n } }
    }
  }
  const host = await PluginTestHost.start(BigPanel)
  await assert.rejects(host.panel(), /can't be sent as JSON/)
  await host.stop()
})

test("a failing teardown is logged; it neither fails the action nor keeps the plugin from stopping", async () => {
  class Messy extends Action {
    static readonly id = "messy"
    run() {
      this.onDispose(() => {
        throw new Error("socket already closed")
      })
      return "worked"
    }
  }
  class Stuck extends Action {
    static readonly id = "stuck"
    run() {
      return new Promise<void>(resolve => {
        this.onDispose(resolve)
        this.onDispose(() => {
          throw new Error("stuck teardown")
        })
      })
    }
  }
  class MessyPlugin extends Plugin {
    static readonly actions = [Messy, Stuck]
  }
  const host = await PluginTestHost.start(MessyPlugin)
  assert.equal(await host.action("messy"), "worked")
  const stuck = host.action("stuck")
  await host.stop()
  await assert.rejects(stuck, /the plugin stopped/)
  const errors = host.sent.flatMap(message => message.type === "log" && message.level === "error" ? [message.message] : [])
  assert.equal(errors.length, 2, errors.join("\n"))
  assert.match(errors[0]!, /cleaning up after messy failed/)
  assert.match(errors[1]!, /cleaning up after stuck failed/)
})

test("signalGroup marks a param in the description, also through optional, refine and meta", async () => {
  const { signalGroup } = await import("../plugin/SignalGroup.ts")
  const { Sensor } = await import("../plugin/Sensor.ts")
  class Grouped extends Sensor {
    static readonly id = "grouped"
    static readonly params = z.object({
      device: signalGroup(z.string().refine(value => value.length > 0)).meta({ title: "Device" }),
      endpoint: signalGroup(z.number().optional()),
      other: z.string()
    })
  }
  class GroupPlugin extends Plugin {
    static readonly sensors = [Grouped]
  }
  const params = (await PluginTestHost.describe(GroupPlugin)).sensors[0]!.params.properties as Record<string, Record<string, unknown>>
  assert.deepEqual([params.device?.signalGroup, params.device?.title, params.endpoint?.signalGroup, params.other?.signalGroup], [true, "Device", true, undefined])
})
