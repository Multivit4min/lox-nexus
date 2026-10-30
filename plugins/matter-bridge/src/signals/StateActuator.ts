import { Actuator } from "@lox-nexus/plugin-sdk"
import type { Value } from "@lox-nexus/plugin-sdk/values"
import type { KindValue, StateKind } from "../devices/DeviceKinds.ts"
import type { MatterBridgePlugin } from "../MatterBridgePlugin.ts"
import { deviceParamsSchema, type DeviceParams } from "./DeviceParams.ts"

/**
 * A device's state from Nexus, shown to every paired controller. Nothing is sent back as a
 * command. A device that doesn't exist, or of a type without this state, refuses the signal with
 * the reason (actuators have no fail()); one removed while it runs fails each command.
 */
export abstract class StateActuator extends Actuator<MatterBridgePlugin, DeviceParams> {
  static readonly params = deviceParamsSchema
  /** a newer state replaces one still waiting; only the last matters */
  static readonly concurrency = "latest"

  protected abstract readonly kind: StateKind

  override start() {
    this.device()
  }

  async run(value: Value) {
    await this.device().setState(this.kind, StateActuator.toKind(value))
  }

  private device() {
    const device = this.plugin.devices.forState(this.params.device, this.kind)
    if (typeof device === "string") throw new Error(device)
    return device
  }

  private static toKind(value: Value): KindValue {
    if (value.type === "boolean" || value.type === "number") return value.value
    if (value.type === "tunableWhite") return { temperature: value.value.temperature, brightness: value.value.brightness }
    throw new Error(`expects a boolean, a number or a tunable white value, got ${value.type}`)
  }
}
