import assert from "node:assert/strict"
import { test } from "node:test"
import { z } from "zod"
import { Action } from "../plugin/Action.ts"
import { Actuator, type ActuatorCommand } from "../plugin/Actuator.ts"
import { color, discoverable, duration, file, slider, timeOfDay } from "../plugin/FieldKinds.ts"
import { Plugin } from "../plugin/Plugin.ts"
import { PluginTestHost } from "../testing/PluginTestHost.ts"
import { TestClock } from "../testing/TestClock.ts"
import { Value, type ValueOf } from "../values/Value.ts"
import type { Panel } from "../wire/PanelShapes.ts"

class QrAction extends Action<UiPlugin> {
  static readonly id = "qr"
  run() {
    return { message: "Scan it", panel: { type: "qr" as const, data: "MT:123" } }
  }
}

class BadLinkAction extends Action<UiPlugin> {
  static readonly id = "badLink"
  run() {
    return { panel: { type: "notice" as const, tone: "warn" as const, text: "x", link: { label: "Go", href: "javascript:alert(1)" } } }
  }
}

class SlowAction extends Action<UiPlugin> {
  static readonly id = "slow"
  async run() {
    for (let step = 1; step <= 4; step++) this.progress(`step ${step}`, step / 4)
    await this.plugin.clock.setTimeout(() => undefined, 0)
    return "done"
  }
}

class RestartActuator extends Actuator<UiPlugin, unknown, ValueOf<"boolean">> {
  static readonly id = "restart"
  static readonly accepts = "boolean"
  run(_value: ValueOf<"boolean">, command?: ActuatorCommand) {
    this.plugin.commands.push(command?.replayed === true ? "replayed" : "fresh")
  }
}

const panel: Panel = {
  type: "sections",
  sections: [
    { title: "State", panel: { type: "keyValue", items: [{ label: "Bridge", value: { text: "running", tone: "ok" }, control: { action: "qr", switch: { checked: true } } }] } },
    { title: "Window", panel: { type: "tiles", tiles: [{ label: "PV", value: 3200, unit: "W" }, { label: "Closes", value: null, until: Date.UTC(2026, 9, 31, 12, 0) }] } },
    { title: "Hint", panel: { type: "notice", tone: "warn", title: "Not paired", text: "Scan the code", link: { label: "Docs", href: "https://example.org" } } }
  ]
}

class UiPlugin extends Plugin {
  static readonly config = z.object({ url: discoverable(z.string().meta({ title: "URL", description: "where" })).optional() })
  static readonly actions = [QrAction, SlowAction, BadLinkAction]
  static readonly actuators = [RestartActuator]
  static readonly panelUpdates = "push" as const
  static async discover(field: string) {
    return [{ label: `found for ${field}`, value: "http://192.0.2.1" }]
  }
  readonly commands: string[] = []
  override panel() {
    return panel
  }
}

test("a host with panel.v2 gets the panel as it is; an older one gets text, key-value lists and no item controls", async () => {
  const current = await PluginTestHost.start(UiPlugin)
  assert.deepEqual(await current.panel(), panel)
  const older = await PluginTestHost.start(UiPlugin, { hostFeatures: [], timeZone: "UTC" })
  const sections = (await older.panel() as Extract<Panel, { type: "sections" }>).sections.map(section => section.panel)
  assert.deepEqual(sections[0], { type: "keyValue", items: [{ label: "Bridge", value: "running" }] })
  assert.deepEqual(sections[1], { type: "keyValue", items: [{ label: "PV", value: "3200 W" }, { label: "Closes", value: "until 31/10/2026, 12:00" }] })
  assert.deepEqual(sections[2], { type: "keyValue", items: [{ label: "Not paired", value: "Scan the code (Docs: https://example.org)" }] })
  await current.stop()
  await older.stop()
})

test("an action answers with a panel part where the host takes it, else with its message", async () => {
  const current = await PluginTestHost.start(UiPlugin)
  assert.deepEqual(await current.actionAnswer("qr"), { message: "Scan it", panel: { type: "qr", data: "MT:123" } })
  assert.equal(await current.action("qr"), "Scan it")
  await assert.rejects(current.action("badLink"), /panel isn't valid[\s\S]*http/, "the author learns it in tests, not on the host")
  const older = await PluginTestHost.start(UiPlugin, { hostFeatures: [] })
  assert.equal(await older.actionAnswer("qr"), "Scan it")
  await current.stop()
  await older.stop()
})

test("progress goes out at most four times a second, the latest always; not to hosts without it", async () => {
  const clock = new TestClock()
  const host = await PluginTestHost.start(UiPlugin, { clock })
  const running = host.action("slow")
  await clock.advance(1)
  assert.equal(await running, "done")
  const progress = host.sent.filter(message => message.type === "action.progress")
  assert.deepEqual(progress.map(message => message.type === "action.progress" ? message.text : ""), ["step 1"], "the rest came within 250 ms and the action ended")
  const older = await PluginTestHost.start(UiPlugin, { clock, hostFeatures: [] })
  const run = older.action("slow")
  await clock.advance(1)
  await run
  assert.equal(older.sent.filter(message => message.type === "action.progress").length, 0)
  await host.stop()
  await older.stop()
})

test("panelChanged reaches the host at most once a second, a change in that second when it ends", async () => {
  const clock = new TestClock()
  const host = await PluginTestHost.start(UiPlugin, { clock })
  const changes = () => host.sent.filter(message => message.type === "panel.changed").length
  host.plugin.panelChanged()
  host.plugin.panelChanged()
  host.plugin.panelChanged()
  assert.equal(changes(), 1)
  await clock.advance(1000)
  assert.equal(changes(), 2, "the calls within the second, once")
  await clock.advance(5000)
  assert.equal(changes(), 2)
  const older = await PluginTestHost.start(UiPlugin, { clock, hostFeatures: [] })
  older.plugin.panelChanged()
  assert.equal(older.sent.filter(message => message.type === "panel.changed").length, 0)
  await host.stop()
  await older.stop()
})

test("an actuator learns whether a command is new or replayed by the host", async () => {
  const host = await PluginTestHost.start(UiPlugin)
  const id = await host.addActuator("restart", {})
  await host.actuate(id, Value.boolean(true))
  await host.actuate(id, Value.boolean(true), undefined, true)
  assert.deepEqual(host.plugin.commands, ["fresh", "replayed"])
  await host.stop()
})

test("the description says the panel is pushed and which fields have Find; discover runs for those only", async () => {
  const description = await PluginTestHost.describe(UiPlugin)
  assert.equal(description.panelPush, true)
  assert.deepEqual(description.discoverable, ["url"])
  assert.deepEqual(await PluginTestHost.discover(UiPlugin, "url"), [{ label: "found for url", value: "http://192.0.2.1" }])
  await assert.rejects(PluginTestHost.discover(UiPlugin, "other"), /not a field/)
})

test("field kinds check their values and tell the form how to show them", () => {
  assert.equal(timeOfDay().safeParse("06:30").success, true)
  assert.equal(timeOfDay().safeParse("24:00").success, false)
  assert.equal(color().safeParse("#ff8800").success, true)
  assert.equal(color().safeParse("orange").success, false)
  const schema = z.toJSONSchema(z.object({
    wait: duration({ unit: "min", max: 120 }), at: timeOfDay(), tint: color(), level: slider(0, 100, 5), cert: file({ accept: ".pem", maxBytes: 9 })
  })) as { properties: Record<string, Record<string, unknown>> }
  assert.deepEqual([schema.properties.wait!.format, schema.properties.wait!.unit, schema.properties.wait!.maximum], ["duration", "min", 120])
  assert.equal(schema.properties.at!.format, "time")
  assert.equal(schema.properties.tint!.format, "color")
  assert.deepEqual([schema.properties.level!.widget, schema.properties.level!.step], ["slider", 5])
  assert.deepEqual([schema.properties.cert!.format, schema.properties.cert!.accept, schema.properties.cert!.maxBytes, schema.properties.cert!.maxLength], ["file", ".pem", 9, 9])
})
