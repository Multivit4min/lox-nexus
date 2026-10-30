import { KindFormat } from "../panel/KindFormat.ts"
import type { BridgedDevice, DeviceContext } from "./BridgedDevice.ts"
import { DeviceFactory } from "./DeviceFactory.ts"
import type { CommandKind, StateKind } from "./DeviceKinds.ts"
import type { DeviceRecord } from "./DeviceRecord.ts"

/**
 * The bridge's devices by id, and the check a signal makes before it uses one. Signals listen for
 * changes, so a device removed (or added again) while they run shows on them at once.
 */
export class DeviceRegistry {
  private readonly byId = new Map<string, BridgedDevice>()
  private readonly listeners = new Set<() => void>()
  private readonly factory: DeviceFactory

  constructor(records: readonly DeviceRecord[], context: DeviceContext) {
    this.factory = new DeviceFactory(context)
    for (const record of records) this.byId.set(record.id, this.factory.create(record))
  }

  all() {
    return [...this.byId.values()]
  }

  get(id: string) {
    return this.byId.get(id)
  }

  get size() {
    return this.byId.size
  }

  /** a new device, not yet part of the node */
  create(record: DeviceRecord) {
    return this.factory.create(record)
  }

  add(device: BridgedDevice) {
    this.byId.set(device.id, device)
    this.changed()
  }

  delete(id: string) {
    if (this.byId.delete(id)) this.changed()
  }

  /** the device with this name, ignoring case (names are unique that way) */
  named(name: string) {
    const wanted = name.toLowerCase()
    return this.all().find(device => device.name.toLowerCase() === wanted)
  }

  /** called after a device was added or removed; returns the unsubscribe */
  onChange(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** the device a sensor uses, or why it can't */
  forCommand(id: string, kind: CommandKind): BridgedDevice | string {
    const device = this.byId.get(id)
    if (!device) return DeviceRegistry.missing(id)
    if (!device.info.commands.includes(kind)) return `"${device.name}" is a ${device.info.label.toLowerCase()}, which gets no ${KindFormat.label(kind)} commands`
    return device
  }

  /** the device an actuator sets, or why it can't */
  forState(id: string, kind: StateKind): BridgedDevice | string {
    const device = this.byId.get(id)
    if (!device) return DeviceRegistry.missing(id)
    if (!device.info.states.includes(kind)) return `"${device.name}" is a ${device.info.label.toLowerCase()}, which has no ${KindFormat.label(kind)} state`
    return device
  }

  private changed() {
    for (const listener of [...this.listeners]) listener()
  }

  private static missing(id: string) {
    return `the bridge has no device "${id}" (any more); add it with Add device, or pick another`
  }
}
