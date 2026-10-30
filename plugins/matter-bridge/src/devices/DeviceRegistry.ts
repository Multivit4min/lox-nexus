import type { BridgeConfig } from "../config/BridgeConfig.ts"
import { KindFormat } from "../panel/KindFormat.ts"
import type { BridgedDevice, DeviceContext } from "./BridgedDevice.ts"
import { DeviceFactory } from "./DeviceFactory.ts"
import type { CommandKind, StateKind } from "./DeviceKinds.ts"


/** The configured devices by name, and the check a signal makes before it uses one. */
export class DeviceRegistry {
  private readonly byName = new Map<string, BridgedDevice>()

  constructor(config: BridgeConfig, context: DeviceContext) {
    const factory = new DeviceFactory(context)
    for (const device of config.devices) this.byName.set(device.name, factory.create(device))
  }

  all() {
    return [...this.byName.values()]
  }

  get(name: string) {
    return this.byName.get(name)
  }

  /** the device a sensor uses, or why it can't */
  forCommand(name: string, kind: CommandKind): BridgedDevice | string {
    const device = this.byName.get(name)
    if (!device) return DeviceRegistry.missing(name)
    if (!device.info.commands.includes(kind)) return `"${name}" is a ${device.info.label.toLowerCase()}, which gets no ${KindFormat.label(kind)} commands`
    return device
  }

  /** the device an actuator sets, or why it can't */
  forState(name: string, kind: StateKind): BridgedDevice | string {
    const device = this.byName.get(name)
    if (!device) return DeviceRegistry.missing(name)
    if (!device.info.states.includes(kind)) return `"${name}" is a ${device.info.label.toLowerCase()}, which has no ${KindFormat.label(kind)} state`
    return device
  }

  private static missing(name: string) {
    return `no device "${name}" in the bridge's settings (Devices); add it there or pick another`
  }
}
