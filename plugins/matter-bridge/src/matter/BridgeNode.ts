import type { PluginLogger } from "@lox-nexus/plugin-sdk"
import { Endpoint, FabricIndex, ServerNode, type Environment } from "@matter/main"
import { AdministratorCommissioning } from "@matter/main/clusters/administrator-commissioning"
import { AggregatorEndpoint } from "@matter/main/endpoints/aggregator"
import { DeviceCommissioner, FabricManager } from "@matter/main/protocol"
import type { BridgedDevice } from "../devices/BridgedDevice.ts"
import type { BridgeIdentity } from "./BridgeIdentity.ts"
import type { Secrets } from "./PairingSecrets.ts"
import { QuietCommissioningServer } from "./QuietCommissioningServer.ts"
import { StartFailure } from "./StartFailure.ts"
import { Vendors } from "./Vendors.ts"

const BridgeRoot = ServerNode.RootEndpoint.with(QuietCommissioningServer)
const { CommissioningWindowStatus } = AdministratorCommissioning

export interface BridgeNodeOptions {
  environment: Environment
  port: number
  identity: BridgeIdentity
  secrets: Secrets
  devices: readonly BridgedDevice[]
  log: PluginLogger
  now(): number
}

/**
 * Which pairing window is open: `basic` takes the bridge's own code; `enhanced` is one a paired
 * controller opened to share the bridge, with a code only that controller's app shows.
 */
export type PairingWindow = "closed" | "basic" | "enhanced"

/** where pairing stands, for the panel */
export interface PairingStatus {
  commissioned: boolean
  manualCode: string
  qrCode: string
  window: PairingWindow
  /** when the window opened with "Open pairing window" closes */
  windowUntil?: number
}

/** a paired controller (a fabric), without matter.js's BigInt ids */
export interface Controller { fabricIndex: number; vendorId: number; label: string }

/**
 * The bridge as a Matter node: a root with an aggregator, one bridged endpoint per device. Starts,
 * reports where pairing stands, opens pairing windows and removes paired controllers.
 */
export class BridgeNode {
  /** a window for another ecosystem stays open this long (Matter's standard window) */
  static readonly WINDOW_MS = 15 * 60_000
  static readonly RESETTING = "the bridge is resetting after its last controller was removed; try again in a few seconds"

  private node: ServerNode<typeof BridgeRoot> | undefined
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
    const aggregator = new Endpoint(AggregatorEndpoint, { id: "devices" })
    await node.add(aggregator)
    for (const device of devices) await aggregator.add(device.endpoint)
    node.lifecycle.online.on(() => this.wentOnline())
    node.lifecycle.offline.on(() => {
      if (!this.closed) this.resetting = true
    })
    node.events.commissioning.fabricsChanged.on((index, action) => log.info(`controller ${this.describe(index)}: ${action}`))
    try {
      await node.start()
    } catch (error) {
      throw new StartFailure(error, port)
    }
    log.info(node.state.commissioning.commissioned ? "Matter bridge started" : "Matter bridge started, not paired yet: the pairing code is on the instance page")
  }

  async close() {
    this.closed = true
    await this.node?.close()
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
    const window = BridgeNode.window(node.env.get(DeviceCommissioner).windowStatus)
    const windowUntil = window === "basic" && this.windowUntil !== undefined && this.windowUntil > this.options.now() ? this.windowUntil : undefined
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
    const node = this.online()
    const commissioned = node.state.commissioning.commissioned
    try {
      await node.act(agent => agent.get(QuietCommissioningServer).enterCommissionableMode())
    } catch (error) {
      if (node.env.get(DeviceCommissioner).isAdministratorWindowOpen) {
        throw new Error("a controller has opened a pairing window right now (sharing the bridge from its app); use the code that app shows, or try again in 15 minutes")
      }
      throw error
    }
    this.windowUntil = commissioned ? this.options.now() + BridgeNode.WINDOW_MS : undefined
    const status = this.pairing()
    if (!status) throw new Error(BridgeNode.RESETTING)
    return status
  }

  /**
   * Removes a paired controller: the bridge leaves its fabric, and its devices disappear from
   * that controller's app. Removing the last one resets the bridge, which waits to be paired again.
   */
  async removeController(fabricIndex: number) {
    const node = this.online()
    const fabric = node.env.get(FabricManager).maybeFor(FabricIndex(fabricIndex))
    if (!fabric) throw new Error(`no paired controller with fabric index ${fabricIndex}`)
    const described = this.describe(fabricIndex)
    await fabric.leave()
    return described
  }

  /** "Amazon Alexa (fabric 1)" for logs and answers */
  describe(fabricIndex: number) {
    const controller = this.controllers().find(candidate => candidate.fabricIndex === fabricIndex)
    return controller ? `${Vendors.describe(controller.label, controller.vendorId)} (fabric ${fabricIndex})` : `fabric ${fabricIndex}`
  }

  /**
   * Listens to the devices again each time the node is online: the factory reset after the last
   * controller is removed rebuilds their events and puts their attributes back to the defaults,
   * so the states Nexus sent are set again then.
   */
  private wentOnline() {
    const { devices, log } = this.options
    this.resetting = false
    for (const device of devices) device.watch()
    if (this.onlineCount++ === 0) return
    for (const device of devices) {
      device.restore().catch(error => log.warn(`could not set the states of "${device.name}" again after the reset: ${error instanceof Error ? error.message : String(error)}`))
    }
  }

  private online() {
    const state = this.state
    if (state === "running" && this.node) return this.node
    throw new Error(state === "resetting" ? BridgeNode.RESETTING : "the Matter bridge is not running")
  }

  private static window(status: AdministratorCommissioning.CommissioningWindowStatus): PairingWindow {
    if (status === CommissioningWindowStatus.BasicWindowOpen) return "basic"
    return status === CommissioningWindowStatus.EnhancedWindowOpen ? "enhanced" : "closed"
  }
}
