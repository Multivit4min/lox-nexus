import { Actuator } from "@lox-nexus/plugin-sdk"
import type { Value } from "@lox-nexus/plugin-sdk/values"
import type { BridgedDevice } from "../devices/BridgedDevice.ts"
import type { StateKind } from "../devices/DeviceKinds.ts"
import type { MatterBridgePlugin } from "../MatterBridgePlugin.ts"
import { deviceParamsSchema, type DeviceParams } from "./DeviceParams.ts"

/**
 * A device's state from Nexus, shown to every paired controller. Nothing is sent back as a
 * command. A device that isn't configured, or of a type without this state, refuses the signal
 * with the reason (actuators have no fail()).
 */
export abstract class StateActuator extends Actuator<MatterBridgePlugin, DeviceParams> {
  static readonly params = deviceParamsSchema
  /** a newer state replaces one still waiting; only the last matters */
  static readonly concurrency = "latest"

  protected abstract readonly kind: StateKind
  private device: BridgedDevice | undefined

  override start() {
    const device = this.plugin.devices.forState(this.params.device, this.kind)
    if (typeof device === "string") throw new Error(device)
    this.device = device
  }

  async run(value: Value) {
    if (value.type !== "boolean" && value.type !== "number") throw new Error(`expects a boolean or a number, got ${value.type}`)
    await this.device?.setState(this.kind, value.value)
  }
}
