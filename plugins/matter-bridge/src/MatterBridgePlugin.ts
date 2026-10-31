import { Plugin, type ConfigMigration } from "@lox-nexus/plugin-sdk"
import type { PairingStatus } from "./matter/PairingWindows.ts"
import { AddDeviceAction } from "./actions/AddDeviceAction.ts"
import { EditDeviceAction } from "./actions/EditDeviceAction.ts"
import { EditLockAction } from "./actions/EditLockAction.ts"
import { OpenPairingWindowAction } from "./actions/OpenPairingWindowAction.ts"
import { RemoveDeviceAction } from "./actions/RemoveDeviceAction.ts"
import { RemovePairingAction } from "./actions/RemovePairingAction.ts"
import { BridgeCatalog } from "./catalog/BridgeCatalog.ts"
import { bridgeConfigSchema, type BridgeConfig } from "./config/BridgeConfig.ts"
import { DeviceManager } from "./devices/DeviceManager.ts"
import { DeviceMemory } from "./devices/DeviceMemory.ts"
import { DeviceRegistry } from "./devices/DeviceRegistry.ts"
import { DeviceStore } from "./devices/DeviceStore.ts"
import { BridgeIdentity } from "./matter/BridgeIdentity.ts"
import { BridgeNode } from "./matter/BridgeNode.ts"
import { MatterEnvironment } from "./matter/MatterEnvironment.ts"
import { MatterLog } from "./matter/MatterLog.ts"
import { PairingSecrets } from "./matter/PairingSecrets.ts"
import { WriteCoalescer } from "./matter/WriteCoalescer.ts"
import { BridgePanel } from "./panel/BridgePanel.ts"
import { Capabilities } from "./signals/Capabilities.ts"

/**
 * A Matter bridge: its devices show up in Alexa, Google Home, Apple Home and Home Assistant.
 * Commands from those apps are sensors, states from Nexus are actuators. Devices are added, edited
 * and removed with actions while it runs and kept in the plugin store, like matter.js's keys; the
 * pairing survives restarts and config changes.
 */
export class MatterBridgePlugin extends Plugin<BridgeConfig> {
  static readonly config = bridgeConfigSchema
  /** 2: the devices moved from the settings into the store */
  static readonly configVersion = 2
  static migrateConfig({ config, from, store }: ConfigMigration) {
    return from < 2 ? DeviceStore.takeOver(store, config) : config
  }
  static readonly sensors = Capabilities.sensors
  static readonly actuators = Capabilities.actuators
  static readonly actions = [AddDeviceAction, EditDeviceAction, EditLockAction, RemoveDeviceAction, OpenPairingWindowAction, RemovePairingAction]
  /** the page refreshes on pairing and pairing windows, controllers, device changes and new commands and states */
  static readonly panelUpdates = "push"

  /** merges bursts of device state writes (a moving blind) into one store write per 1.5 s */
  readonly coalescer = new WriteCoalescer((ms, run) => this.schedule(ms, run))
  readonly memory = new DeviceMemory(this.store, this.coalescer)
  readonly deviceStore = new DeviceStore(this.store, this.log)
  readonly devices = new DeviceRegistry(this.loadDevices(), {
    now: () => this.clock.now(),
    wait: ms => this.wait(ms),
    warn: message => this.log.warn(message),
    memory: this.memory,
    shown: () => this.panelChanged()
  })
  readonly matter = new MatterEnvironment(this.store, { warn: message => this.log.warn(message), coalescer: this.coalescer })
  readonly bridge = new BridgeNode({
    environment: this.matter.env,
    port: this.config.port,
    identity: new BridgeIdentity(this.context.instanceId, this.config.name),
    secrets: new PairingSecrets(this.store).get(),
    devices: () => this.devices.all(),
    log: this.log,
    clock: this.clock,
    changed: () => this.panelChanged()
  })
  readonly manager = new DeviceManager(this.deviceStore, this.devices, this.bridge, this.memory, this.log)
  /** pauses running now (a long press); they end when the plugin stops */
  private readonly waiting = new Set<() => void>()

  override async start() {
    // teardowns run last first: close the node (its storage writes what is pending), write the
    // remembered states, end the environment, and stop routing matter.js's log last
    this.onDispose(new MatterLog(this.log, this.logLevel).install())
    this.onDispose(() => this.matter.close())
    this.onDispose(() => this.coalescer.flush())
    this.onDispose(() => this.bridge.close())
    // a stop cancels the timers of pauses still running; end them, so nothing waits forever
    this.onDispose(() => {
      for (const done of [...this.waiting]) done()
    })
    this.memory.keepOnly(this.devices.all().map(device => device.identity.endpointId))
    this.onDispose(this.devices.onChange(() => this.panelChanged()))
    await this.bridge.start()
  }

  /** opens a pairing window; the page refreshes now and once the 15 minutes are over */
  async openPairingWindow(): Promise<PairingStatus> {
    const status = await this.bridge.openPairingWindow()
    if (this.isDisposed) return status
    this.panelChanged()
    if (status.windowUntil !== undefined) this.after(status.windowUntil - this.clock.now() + 1000, () => this.panelChanged())
    return status
  }

  override catalog() {
    return new BridgeCatalog(this.devices.all()).nodes()
  }

  override panel() {
    return new BridgePanel(this.bridge, this.devices.all(), this.timeZone).build()
  }

  private loadDevices() {
    return this.deviceStore.load()
  }

  /** a pause on the plugin's clock (a long press); ends early, without waiting, when the plugin stops */
  private wait(ms: number) {
    return new Promise<void>(resolve => {
      if (this.isDisposed) return resolve()
      const done = () => {
        this.waiting.delete(done)
        resolve()
      }
      this.waiting.add(done)
      this.after(ms, done)
    })
  }

  /** a timer for the coalescer; once stopping, writes go out at once */
  private schedule(ms: number, run: () => void) {
    if (this.isDisposed) {
      run()
      return () => {}
    }
    return this.after(ms, run)
  }
}
