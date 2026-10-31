import type { Clock, PluginLogger } from "@lox-nexus/plugin-sdk"
import { Endpoint, FabricIndex, ServerNode, type Environment } from "@matter/main"
import { AggregatorEndpoint } from "@matter/main/endpoints/aggregator"
import { DeviceCommissioner, FabricManager } from "@matter/main/protocol"
import type { BridgedDevice } from "../devices/BridgedDevice.ts"
import type { BridgeIdentity } from "./BridgeIdentity.ts"
import type { Secrets } from "./PairingSecrets.ts"
import { Deadline } from "./Deadline.ts"
import { PairingWindows, type Controller, type PairingStatus } from "./PairingWindows.ts"
import { QuietCommissioningServer } from "./QuietCommissioningServer.ts"
import { StartFailure } from "./StartFailure.ts"
import { Vendors } from "./Vendors.ts"

const BridgeRoot = ServerNode.RootEndpoint.with(QuietCommissioningServer)

export interface BridgeNodeOptions {
  environment: Environment
  port: number
  identity: BridgeIdentity
  secrets: Secrets
  /** the devices now; devices added or removed later go through addDevice() and removeDevice() */
  devices(): readonly BridgedDevice[]
  log: PluginLogger
  /** the plugin's clock: the pairing window's end, and the deadline of a stop */
  clock: Clock
  /** where pairing stands changed: online or offline, a controller added or removed */
  changed?(): void
}

/**
 * The bridge as a Matter node: a root with an aggregator, one bridged endpoint per device. Starts,
 * reports where pairing stands, opens pairing windows and removes paired controllers.
 */
export class BridgeNode {
  /** a window for another ecosystem stays open this long (Matter's standard window) */
  static readonly WINDOW_MS = 15 * 60_000
  /** how long a stop waits for matter.js; Nexus gives a plugin 5 s to stop */
  static readonly CLOSE_MS = 3000
  static readonly RESETTING = "the bridge is resetting after its last controller was removed; try again in a few seconds"

  private node: ServerNode<typeof BridgeRoot> | undefined
  private aggregator: Endpoint<typeof AggregatorEndpoint> | undefined
  private windowUntil: number | undefined
  private closed = false
  private onlineCount = 0
  /** offline without a close: the factory reset that follows removing the last controller */
  private resetting = false

  constructor(private readonly options: BridgeNodeOptions) {}

  async start() {
    const { environment, port, identity, secrets, devices, log } = this.options
    const node = this.node = await ServerNode.create(BridgeRoot, {
      id: "bridge",
      environment,
      network: { port },
      commissioning: { passcode: secrets.passcode, discriminator: secrets.discriminator },
      productDescription: identity.productDescription(),
      basicInformation: identity.basicInformation()
    })
    const aggregator = this.aggregator = new Endpoint(AggregatorEndpoint, { id: "devices" })
    await node.add(aggregator)
    for (const device of devices()) await this.attach(device)
    node.lifecycle.online.on(() => this.wentOnline())
    node.lifecycle.offline.on(() => {
      if (!this.closed) this.resetting = true
      this.options.changed?.()
    })
    // a window a paired app opens to share the bridge, and its end, change the cluster's state
    node.events.administratorCommissioning.windowStatus$Changed.on(() => this.options.changed?.())
    node.events.commissioning.fabricsChanged.on((index, action) => {
      log.info(`controller ${this.describe(index)}: ${action}`)
      this.options.changed?.()
    })
    try {
      await node.start()
    } catch (error) {
      throw new StartFailure(error, port)
    }
    log.info(node.state.commissioning.commissioned ? "Matter bridge started" : "Matter bridge started, not paired yet: the pairing code is on the instance page")
  }

  /** adds a device to the running bridge; controllers see it appear (Alexa may need "Discover devices") */
  async addDevice(device: BridgedDevice) {
    this.assertRunning()
    await this.attach(device)
    device.watch()
  }

  /** removes a device from the running bridge and drops what matter.js stored of it */
  async removeDevice(device: BridgedDevice) {
    this.assertRunning()
    await device.endpoint.delete()
    device.attached = false
  }

  /** closes the node, at most CLOSE_MS: with a paired controller gone, matter.js waits ~5 s (Nexus's stop budget) */
  async close() {
    this.closed = true
    if (!this.node) return
    const closing = this.node.close()
    closing.catch(error => this.options.log.debug(`closing the Matter node: ${error instanceof Error ? error.message : String(error)}`))
    if (!await Deadline.within(closing, BridgeNode.CLOSE_MS, this.options.clock)) {
      this.options.log.warn(`the Matter bridge didn't close within ${BridgeNode.CLOSE_MS / 1000} s (a paired controller doesn't answer); stopped anyway`)
    }
  }

  /** `resetting` between removing the last controller and the bridge being back, waiting for a pairing */
  get state(): "running" | "resetting" | "stopped" {
    if (this.resetting) return "resetting"
    return this.node?.lifecycle.isOnline ? "running" : "stopped"
  }

  pairing(): PairingStatus | undefined {
    const node = this.node
    if (this.state !== "running" || !node) return undefined
    const { commissioned, pairingCodes } = node.state.commissioning
    const window = PairingWindows.of(node.env.get(DeviceCommissioner).windowStatus)
    const windowUntil = window === "basic" && this.windowUntil !== undefined && this.windowUntil > this.options.clock.now() ? this.windowUntil : undefined
    return { commissioned, manualCode: pairingCodes.manualPairingCode, qrCode: pairingCodes.qrPairingCode, window, windowUntil }
  }

  controllers(): Controller[] {
    const fabrics = this.node && this.state === "running" ? Object.values(this.node.state.commissioning.fabrics) : []
    return fabrics.map(fabric => ({ fabricIndex: Number(fabric.fabricIndex), vendorId: Number(fabric.rootVendorId), label: fabric.label }))
  }

  /**
   * Opens a basic commissioning window with the bridge's own code: 15 minutes once paired (to add
   * another ecosystem), Matter's long window while not paired.
   */
  async openPairingWindow(): Promise<PairingStatus> {
    const node = this.assertRunning()
    const commissioned = node.state.commissioning.commissioned
    try {
      await node.act(agent => agent.get(QuietCommissioningServer).enterCommissionableMode())
    } catch (error) {
      if (node.env.get(DeviceCommissioner).isAdministratorWindowOpen) {
        throw new Error("a controller has opened a pairing window right now (sharing the bridge from its app); use the code that app shows, or try again in 15 minutes", { cause: error })
      }
      throw error
    }
    this.windowUntil = commissioned ? this.options.clock.now() + BridgeNode.WINDOW_MS : undefined
    const status = this.pairing()
    if (!status) throw new Error(BridgeNode.RESETTING)
    return status
  }

  /**
   * Removes a paired controller: the bridge leaves its fabric, and its devices disappear from
   * that controller's app. Removing the last one resets the bridge, which waits to be paired again.
   */
  async removeController(fabricIndex: number) {
    const node = this.assertRunning()
    const fabric = node.env.get(FabricManager).maybeFor(FabricIndex(fabricIndex))
    if (!fabric) throw new Error(`no paired controller with fabric index ${fabricIndex}`)
    const described = this.describe(fabricIndex)
    await fabric.leave()
    return described
  }

  /** "Amazon Alexa (fabric 1)" for logs and answers */
  describe(fabricIndex: number) {
    return Vendors.describeFabric(this.controllers(), fabricIndex)
  }


  /**
   * Listens to the devices again each time the node is online: the factory reset after the last
   * controller is removed rebuilds their events and puts the endpoints back to how they were
   * created, so their settings (label, a lock's unlocking) and the states Nexus sent are set again.
   */
  private wentOnline() {
    const { devices, log } = this.options
    this.resetting = false
    this.options.changed?.()
    for (const device of devices()) device.watch()
    if (this.onlineCount++ === 0) return
    for (const device of devices()) {
      device.reconnect().catch(error => log.warn(`could not set up "${device.name}" again after the reset: ${error instanceof Error ? error.message : String(error)}`))
    }
  }

  /** an endpoint that was added but couldn't be set up is deleted again, so no half device stays */
  private async attach(device: BridgedDevice) {
    if (!this.aggregator) throw new Error("the Matter bridge is not running")
    await this.aggregator.add(device.endpoint)
    try {
      device.attached = true
      await device.sync()
    } catch (error) {
      device.attached = false
      await device.endpoint.delete().catch(() => {})
      throw error
    }
  }

  /** the running node; throws otherwise, saying "resetting" during the reset after the last controller left */
  assertRunning() {
    const state = this.state
    if (state === "running" && this.node) return this.node
    throw new Error(state === "resetting" ? BridgeNode.RESETTING : "the Matter bridge is not running")
  }

}
