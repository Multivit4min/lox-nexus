import assert from "node:assert/strict"
import { after, before, beforeEach, describe, test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { HomeAssistantPlugin } from "../HomeAssistantPlugin.ts"
import { FakeHomeAssistant } from "../test-support/FakeHomeAssistant.ts"
import { waitFor } from "../test-support/waitFor.ts"

const rgbw = (red: number, green: number, blue: number, white: number, fadeTime = 0) => Value.rgbw({ red, green, blue, white, fadeTime, flags: 0 })

describe("HomeAssistantPlugin: actuators", { timeout: 15_000 }, () => {
  let ha: FakeHomeAssistant
  let host: PluginTestHost

  before(async () => {
    ha = await FakeHomeAssistant.start()
    ha.set("light.rgb", "on", { supported_color_modes: ["xy", "color_temp"] })
    ha.set("light.rgbw", "on", { supported_color_modes: ["rgbw"] })
    ha.set("input_datetime.alarm", "06:30:00", { has_date: false, has_time: true })
    ha.set("input_datetime.holiday", "2026-12-24", { has_date: true, has_time: false })
    // commands to an entity Home Assistant doesn't have fail now, so every target exists
    for (const entityId of ["button.restart", "climate.living", "cover.blind", "date.birthday", "datetime.next_run", "input_datetime.party", "input_number.level", "lock.door", "media_player.kitchen", "scene.movie", "select.mode", "switch.pump", "time.wake_up", "todo.shopping_list", "valve.garden"]) ha.set(entityId, "unknown")
    host = await PluginTestHost.start(HomeAssistantPlugin, { config: { url: ha.url, token: FakeHomeAssistant.TOKEN } })
    await waitFor(() => ha.clients === 1)
  })
  after(async () => {
    await host.stop()
    await ha.close()
  })
  beforeEach(() => void ha.calls.splice(0))

  /** adds the actuator, runs it with each value and returns the service calls made */
  const run = async (capability: string, params: Record<string, unknown>, ...values: Value[]) => {
    const id = await host.addActuator(capability, params)
    for (const value of values) await host.actuate(id, value)
    await host.remove(id)
    return ha.calls.splice(0).map(call => [`${call.domain}.${call.service}`, call.service_data, call.target?.entity_id])
  }

  test("on/off uses each domain's services", async () => {
    assert.deepEqual(await run("onOff", { entityId: "switch.pump" }, Value.boolean(true), Value.boolean(false)), [
      ["switch.turn_on", {}, "switch.pump"], ["switch.turn_off", {}, "switch.pump"]
    ])
    assert.deepEqual((await run("onOff", { entityId: "cover.blind" }, Value.boolean(true))).map(call => call[0]), ["cover.open_cover"])
    assert.deepEqual((await run("onOff", { entityId: "lock.door" }, Value.boolean(false))).map(call => call[0]), ["lock.unlock"])
  })

  test("trigger fires on true only, so a scene isn't activated by the falling edge", async () => {
    assert.deepEqual(await run("trigger", { entityId: "scene.movie" }, Value.boolean(true), Value.boolean(false)), [["scene.turn_on", {}, "scene.movie"]])
    assert.deepEqual((await run("trigger", { entityId: "button.restart" }, Value.boolean(true))).map(call => call[0]), ["button.press"])
  })

  test("light brightness, colour and temperature", async () => {
    const brightness = await run("lightBrightness", { entityId: "light.rgb" },
      Value.singleChannel({ channel: 40, fadeTime: 2 }), Value.singleChannel({ channel: 0, fadeTime: 0 }))
    assert.deepEqual(brightness, [["light.turn_on", { brightness_pct: 40, transition: 2 }, "light.rgb"], ["light.turn_off", {}, "light.rgb"]])
    const color = await run("lightColor", { entityId: "light.rgb" }, rgbw(50, 0, 0, 20, 1), rgbw(0, 0, 0, 0))
    assert.deepEqual(color, [
      ["light.turn_on", { rgb_color: [255, 73, 73], brightness_pct: 70, transition: 1 }, "light.rgb"],
      ["light.turn_off", {}, "light.rgb"]
    ], "white is mixed into red, green and blue; the brightest channel is the brightness")
    const withWhite = await run("lightColor", { entityId: "light.rgbw" }, rgbw(0, 25, 0, 50))
    assert.deepEqual(withWhite, [["light.turn_on", { rgbw_color: [0, 128, 0, 255], brightness_pct: 50 }, "light.rgbw"]])
    const temperature = await run("lightTemperature", { entityId: "light.rgb" }, Value.tunableWhite({ temperature: 2700, brightness: 80, fadeTime: 0 }))
    assert.deepEqual(temperature, [["light.turn_on", { color_temp_kelvin: 2700, brightness_pct: 80 }, "light.rgb"]])
  })

  test("positions, temperatures, numbers and texts", async () => {
    assert.deepEqual(await run("position", { entityId: "valve.garden" }, Value.number(30)), [["valve.set_valve_position", { position: 30 }, "valve.garden"]])
    assert.deepEqual(await run("position", { entityId: "cover.blind" }, Value.number(120)), [["cover.set_cover_position", { position: 100 }, "cover.blind"]])
    assert.deepEqual(await run("tilt", { entityId: "cover.blind" }, Value.number(45)), [["cover.set_cover_tilt_position", { tilt_position: 45 }, "cover.blind"]])
    assert.deepEqual(await run("temperature", { entityId: "climate.living" }, Value.number(21.5)), [["climate.set_temperature", { temperature: 21.5 }, "climate.living"]])
    assert.deepEqual(await run("number", { entityId: "input_number.level" }, Value.number(3)), [["input_number.set_value", { value: 3 }, "input_number.level"]])
    assert.deepEqual(await run("text", { entityId: "select.mode" }, Value.string("eco")), [["select.select_option", { option: "eco" }, "select.mode"]])
    assert.deepEqual(await run("text", { entityId: "climate.living" }, Value.string("off")), [["climate.set_hvac_mode", { hvac_mode: "off" }, "climate.living"]])
  })

  test("date and time: text or seconds since midnight, as each domain's service takes them", async () => {
    const helper = await run("dateTime", { entityId: "input_datetime.party" },
      Value.string("2026-10-28 19:30:00"), Value.string("2026-10-31"), Value.number(23_400), Value.string(""))
    assert.deepEqual(helper, [
      ["input_datetime.set_datetime", { datetime: "2026-10-28 19:30:00" }, "input_datetime.party"],
      ["input_datetime.set_datetime", { date: "2026-10-31" }, "input_datetime.party"],
      ["input_datetime.set_datetime", { time: "06:30:00" }, "input_datetime.party"]
    ], "empty text sets nothing")
    assert.deepEqual(await run("dateTime", { entityId: "input_datetime.alarm" }, Value.string("2026-10-28 07:15")), [
      ["input_datetime.set_datetime", { time: "07:15:00" }, "input_datetime.alarm"]
    ], "a time-only helper gets only the time")
    assert.deepEqual(await run("dateTime", { entityId: "time.wake_up" }, Value.number(25_200)), [["time.set_value", { time: "07:00:00" }, "time.wake_up"]])
    assert.deepEqual(await run("dateTime", { entityId: "datetime.next_run" }, Value.string("2026-11-01T08:00:00")), [
      ["datetime.set_value", { datetime: "2026-11-01 08:00:00" }, "datetime.next_run"]
    ])
    const holiday = await host.addActuator("dateTime", { entityId: "input_datetime.holiday" })
    await assert.rejects(host.actuate(holiday, Value.number(3600)), /holds only a date; the value has none/)
    const date = await host.addActuator("dateTime", { entityId: "date.birthday" })
    await assert.rejects(host.actuate(date, Value.string("07:00")), /date\.birthday needs a date/)
    await assert.rejects(host.actuate(date, Value.string("someday")), /is not a date or time/)
    await Promise.all([host.remove(holiday), host.remove(date)])
    assert.deepEqual(ha.calls, [])
  })

  test("a to-do item is added from text; empty text adds nothing", async () => {
    assert.deepEqual(await run("todoItem", { entityId: "todo.shopping_list" }, Value.string(" Milk "), Value.string("")), [
      ["todo.add_item", { item: "Milk" }, "todo.shopping_list"]
    ])
  })

  test("a service call puts the value in its field, or triggers without one", async () => {
    const volume = await run("service", { domain: "media_player", service: "volume_set", entityId: "media_player.kitchen", field: "volume_level" }, Value.number(0.4))
    assert.deepEqual(volume, [["media_player.volume_set", { volume_level: 0.4 }, "media_player.kitchen"]])
    const notify = await run("service", { domain: "notify", service: "notify", data: { message: "door open" } }, Value.boolean(true), Value.boolean(false), Value.number(0))
    assert.deepEqual(notify, [["notify.notify", { message: "door open" }, undefined]])
  })

  test("a refused call fails the command; entities of another domain are refused when added", async () => {
    ha.failNext = { code: "service_validation_error", message: "Value 500 for input_number.level outside of range 0 - 100" }
    const id = await host.addActuator("number", { entityId: "input_number.level" })
    await assert.rejects(host.actuate(id, Value.number(500)), /outside of range/)
    await host.remove(id)
    await assert.rejects(host.addActuator("position", { entityId: "switch.pump" }), /works with cover, valve entities, not switch/)
  })

  test("an entity that doesn't exist (any more) fails the signal and each command; its return clears that", async () => {
    const id = await host.addActuator("onOff", { entityId: "switch.gone" })
    const errors = () => host.sent.flatMap(message => (message.type === "signal.error" && message.signalId === id ? [message.error] : []))
    assert.deepEqual(errors(), ["Home Assistant has no entity switch.gone"])
    await assert.rejects(host.actuate(id, Value.boolean(true)), /no entity switch.gone/)
    assert.deepEqual(ha.calls.splice(0), [], "nothing was sent")
    ha.set("switch.gone", "off")
    await waitFor(() => host.sent.some(message => message.type === "signal.recovered" && message.signalId === id))
    await host.actuate(id, Value.boolean(true))
    ha.remove("switch.gone")
    await waitFor(() => errors().includes("switch.gone was removed from Home Assistant"))
    await host.remove(id)
  })

  test("a service call with a target entity checks it like the others; one without has nothing to check", async () => {
    const id = await host.addActuator("service", { domain: "lock", service: "unlock", entityId: "lock.gone", field: "code" })
    const errors = host.sent.flatMap(message => (message.type === "signal.error" && message.signalId === id ? [message.error] : []))
    assert.deepEqual(errors, ["Home Assistant has no entity lock.gone"])
    await assert.rejects(host.actuate(id, Value.string("1234")), /no entity lock.gone/)
    await host.remove(id)
    const notify = await host.addActuator("service", { domain: "notify", service: "notify", data: { message: "hi" } })
    await host.actuate(notify, Value.boolean(true))
    assert.ok(!host.sent.some(message => message.type === "signal.error" && message.signalId === notify))
    await host.remove(notify)
    assert.deepEqual(ha.calls.splice(0).map(call => `${call.domain}.${call.service}`), ["notify.notify"])
  })

  test("the debug line of a call names the data fields, never their values (a lock's code)", async () => {
    const before = host.sent.length
    await run("service", { domain: "lock", service: "unlock", entityId: "lock.door", field: "code" }, Value.string("4711"))
    const debug = host.sent.slice(before).filter(message => message.type === "log" && message.level === "debug" && message.message === "call lock.unlock")
    assert.deepEqual(debug.map(message => message.type === "log" && message.data), [{ entityId: "lock.door", fields: ["code"] }])
    assert.ok(!JSON.stringify(debug).includes("4711"))
  })
})
