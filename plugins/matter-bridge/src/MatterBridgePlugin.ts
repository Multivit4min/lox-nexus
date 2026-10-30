import { Plugin } from "@lox-nexus/plugin-sdk"
import { OpenPairingWindowAction } from "./actions/OpenPairingWindowAction.ts"
import { RemovePairingAction } from "./actions/RemovePairingAction.ts"
import { BridgeCatalog } from "./catalog/BridgeCatalog.ts"
import { bridgeConfigSchema, type BridgeConfig } from "./config/BridgeConfig.ts"
import { DeviceMemory } from "./devices/DeviceMemory.ts"
import { DeviceRegistry } from "./devices/DeviceRegistry.ts"
import { BridgeIdentity } from "./matter/BridgeIdentity.ts"
import { BridgeNode } from "./matter/BridgeNode.ts"
import { MatterEnvironment } from "./matter/MatterEnvironment.ts"
import { MatterLog } from "./matter/MatterLog.ts"
import { PairingSecrets } from "./matter/PairingSecrets.ts"
import { WriteCoalescer } from "./matter/WriteCoalescer.ts"
import { BridgePanel } from "./panel/BridgePanel.ts"
import { Capabilities } from "./signals/Capabilities.ts"

/**
 * A Matter bridge: the configured devices show up in Alexa, Google Home, Apple Home and Home
 * Assistant. Commands from those apps are sensors, states from Nexus are actuators. matter.js keeps
 * its keys in the plugin store; the pairing survives restarts and config changes.
 */
export class MatterBridgePlugin extends Plugin<BridgeConfig> {
  static readonly config = bridgeConfigSchema
  static readonly sensors = Capabilities.sensors
  static readonly actuators = Capabilities.actuators
  static readonly actions = [OpenPairingWindowAction, RemovePairingAction]

  /** merges bursts of device state writes (a moving blind) into one store write per 1.5 s */
  readonly coalescer = new WriteCoalescer((ms, run) => this.schedule(ms, run))
  readonly memory = new DeviceMemory(this.store, this.coalescer)
  readonly devices = new DeviceRegistry(this.config, { now: () => this.clock.now(), memory: this.memory })
  readonly matter = new MatterEnvironment(this.store, { warn: message => this.log.warn(message), coalescer: this.coalescer })
  readonly bridge = new BridgeNode({
    environment: this.matter.env,
    port: this.config.port,
    identity: new BridgeIdentity(this.context.instanceId, this.config.name),
    secrets: new PairingSecrets(this.store).get(),
    devices: this.devices.all(),
    log: this.log,
    now: () => this.clock.now()
  })

  override async start() {
    // teardowns run last first: close the node (its storage writes what is pending), write the
    // remembered states, end the environment, and stop routing matter.js's log last
    this.onDispose(new MatterLog(this.log).install())
    this.onDispose(() => this.matter.close())
    this.onDispose(() => this.coalescer.flush())
    this.onDispose(() => this.bridge.close())
    this.memory.keepOnly(this.devices.all().map(device => device.identity.endpointId))
    await this.bridge.start()
  }

  override catalog() {
    return new BridgeCatalog(this.devices.all()).nodes()
  }

  override panel() {
    return new BridgePanel(this.bridge, this.devices.all(), this.timeZone).build()
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
