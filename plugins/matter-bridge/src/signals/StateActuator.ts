import { Actuator } from "@lox-nexus/plugin-sdk"
import type { Value } from "@lox-nexus/plugin-sdk/values"
import type { KindValue, StateKind } from "../devices/DeviceKinds.ts"
import type { MatterBridgePlugin } from "../MatterBridgePlugin.ts"
import { deviceParamsSchema, type DeviceParams } from "./DeviceParams.ts"

/**
 * A device's state from Nexus, shown to every paired controller. Nothing is sent back as a
 * command. A device that doesn't exist (any more), or of a type without this state, fails the
 * signal with the reason, and each command with it; adding the device clears the failure.
 */
export abstract class StateActuator extends Actuator<MatterBridgePlugin, DeviceParams> {
  static readonly params = deviceParamsSchema
  /** a newer state replaces one still waiting; only the last matters */
  static readonly concurrency = "latest"

  protected abstract readonly kind: StateKind

  override start() {
    this.onDispose(this.plugin.devices.onChange(() => this.resolve()))
    this.resolve()
  }

  async run(value: Value) {
    const device = this.resolve()
    if (typeof device === "string") throw new Error(device)
    await device.setState(this.kind, StateActuator.toKind(value))
  }

  // the device, or why there is none; keeps the signal's failure in step either way
  private resolve() {
    const device = this.plugin.devices.forState(this.params.device, this.kind)
    if (typeof device === "string") this.fail(device)
    else this.recover()
    return device
  }

  private static toKind(value: Value): KindValue {
    if (value.type === "boolean" || value.type === "number" || value.type === "string") return value.value
    if (value.type === "tunableWhite") return { temperature: value.value.temperature, brightness: value.value.brightness }
    // the white channel has no place in Matter's colour; a white light is a colour temperature
    if (value.type === "rgbw") return { red: value.value.red, green: value.value.green, blue: value.value.blue }
    throw new Error(`expects a boolean, a number, a text, a tunable white or an RGBW value, got ${value.type}`)
  }
}
