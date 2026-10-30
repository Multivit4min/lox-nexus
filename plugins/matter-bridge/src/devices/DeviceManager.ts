import type { PluginLogger } from "@lox-nexus/plugin-sdk"
import type { BridgeNode } from "../matter/BridgeNode.ts"
import type { BridgedDevice } from "./BridgedDevice.ts"
import { DeviceId } from "./DeviceId.ts"
import type { DeviceTypeId } from "./DeviceKinds.ts"
import type { DeviceMemory } from "./DeviceMemory.ts"
import type { DeviceRegistry } from "./DeviceRegistry.ts"
import type { DeviceStore } from "./DeviceStore.ts"

/**
 * Adds, edits and removes devices while the bridge runs: the store, the registry the signals use
 * and the Matter node change together, without a restart.
 */
export class DeviceManager {
  /** Alexa takes at most 50 devices from one bridge */
  static readonly MAX_DEVICES = 50

  constructor(
    private readonly store: DeviceStore,
    private readonly registry: DeviceRegistry,
    private readonly bridge: BridgeNode,
    private readonly memory: DeviceMemory,
    private readonly log: PluginLogger
  ) {}

  async add(name: string, type: DeviceTypeId, allowUnlock: boolean) {
    this.bridge.assertRunning()
    if (this.registry.size >= DeviceManager.MAX_DEVICES) throw new Error(`the bridge has ${DeviceManager.MAX_DEVICES} devices, Alexa's limit for one bridge; remove one first`)
    this.assertFree(name)
    const id = DeviceId.create(name, new Set(this.registry.all().map(device => device.id)))
    const device = this.registry.create({ id, name, type, allowUnlock: type === "door-lock" && allowUnlock })
    await this.bridge.addDevice(device)
    this.registry.add(device)
    this.save()
    return device
  }

  /** without `allowUnlock`, a lock keeps what it had */
  async edit(id: string, name: string, allowUnlock?: boolean) {
    this.bridge.assertRunning()
    const device = this.device(id)
    this.assertFree(name, device)
    const unlock = device.type === "door-lock" && (allowUnlock ?? device.allowUnlock)
    const allowing = unlock && !device.allowUnlock
    await device.update({ name, allowUnlock: unlock })
    this.save()
    if (allowing) this.log.warn(`unlocking from the paired apps is now allowed for "${device.name}" (${device.id}), by an action`)
    return device
  }

  async remove(id: string) {
    const device = this.device(id)
    await this.bridge.removeDevice(device)
    this.registry.delete(id)
    this.memory.forget(device.identity.endpointId)
    this.save()
    return device
  }

  private device(id: string): BridgedDevice {
    const device = this.registry.get(id)
    if (!device) throw new Error(`the bridge has no device "${id}"`)
    return device
  }

  /** names are unique, ignoring case, as Alexa compares them */
  private assertFree(name: string, self?: BridgedDevice) {
    const other = this.registry.named(name)
    if (other && other !== self) throw new Error(`the bridge already has a device named "${other.name}" (${other.id})`)
  }

  private save() {
    this.store.save(this.registry.all().map(device => device.toRecord()))
  }
}
