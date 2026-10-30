import { Sensor } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { CommandKind, KindValue } from "../devices/DeviceKinds.ts"
import type { MatterBridgePlugin } from "../MatterBridgePlugin.ts"
import { deviceParamsSchema, type DeviceParams } from "./DeviceParams.ts"

/**
 * Commands from controllers for one device: what Alexa, Google or Apple asked for. A device that
 * isn't configured, or of a type without this command, fails the signal with the reason.
 */
export abstract class CommandSensor extends Sensor<MatterBridgePlugin, DeviceParams> {
  static readonly params = deviceParamsSchema

  protected abstract readonly kind: CommandKind

  override start() {
    const device = this.plugin.devices.forCommand(this.params.device, this.kind)
    if (typeof device === "string") return this.fail(device)
    this.onDispose(device.onCommand(this.kind, value => this.emit(CommandSensor.toValue(value))))
  }

  private static toValue(value: KindValue) {
    return typeof value === "boolean" ? Value.boolean(value) : Value.number(value)
  }
}
