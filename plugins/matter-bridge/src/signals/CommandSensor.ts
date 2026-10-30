import { Sensor } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { BridgedDevice } from "../devices/BridgedDevice.ts"
import type { CommandKind, KindValue } from "../devices/DeviceKinds.ts"
import type { MatterBridgePlugin } from "../MatterBridgePlugin.ts"
import { deviceParamsSchema, type DeviceParams } from "./DeviceParams.ts"

/**
 * Commands from controllers for one device: what Alexa, Google or Apple asked for. A device that
 * doesn't exist (any more), or of a type without this command, fails the signal with the reason;
 * the signal follows devices removed and added while it runs.
 */
export abstract class CommandSensor extends Sensor<MatterBridgePlugin, DeviceParams> {
  static readonly params = deviceParamsSchema

  protected abstract readonly kind: CommandKind
  private device: BridgedDevice | undefined
  private unsubscribe: (() => void) | undefined

  override start() {
    this.onDispose(this.plugin.devices.onChange(() => this.resolve()))
    this.onDispose(() => this.unsubscribe?.())
    this.resolve()
  }

  private resolve() {
    const device = this.plugin.devices.forCommand(this.params.device, this.kind)
    if (device === this.device) return
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.device = undefined
    if (typeof device === "string") return this.fail(device)
    this.device = device
    this.unsubscribe = device.onCommand(this.kind, value => this.emit(CommandSensor.toValue(value)))
    this.recover()
  }

  private static toValue(value: KindValue) {
    if (typeof value === "object") return Value.tunableWhite({ ...value, fadeTime: 0 })
    return typeof value === "boolean" ? Value.boolean(value) : Value.number(value)
  }
}
