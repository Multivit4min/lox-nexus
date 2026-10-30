import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import type { ClientNode } from "@matter/main"
import { MatterBridgePlugin } from "../MatterBridgePlugin.ts"
import { FreePort } from "./FreePort.ts"
import { LoopbackMdns } from "./LoopbackMdns.ts"
import { TestController } from "./TestController.ts"

type DeviceState = Record<string, Record<string, unknown> | undefined>
export interface TestDevice { id?: string; name: string; type: string; allowUnlock?: boolean }

/**
 * A bridge under PluginTestHost on a free port and a matter.js controller in the same process, for
 * tests that pair over the real network (mDNS and UDP).
 */
export class BridgeHarness {
  private constructor(public host: PluginTestHost<typeof MatterBridgePlugin>, readonly controller: TestController, readonly config: unknown) {}

  /** a bridge with these devices in its store; a device's id is its name unless given */
  static async start(devices: TestDevice[]) {
    LoopbackMdns.use()
    const config = { port: await FreePort.udp() }
    const host = await PluginTestHost.start(MatterBridgePlugin, { config, store: BridgeHarness.store(devices) })
    return new BridgeHarness(host, await TestController.start(), config)
  }

  /** a plugin store holding these devices */
  static store(devices: TestDevice[]) {
    return { devices: devices.map(({ id, name, type, allowUnlock }) => ({ id: id ?? name, name, type, allowUnlock: allowUnlock ?? false })) }
  }

  /** stops the bridge and starts it again on the same store, like a config change does */
  async restart() {
    await this.host.stop()
    this.host = await PluginTestHost.start(MatterBridgePlugin, { config: this.config, store: this.host.store })
  }

  /** pairs the controller with the bridge's own code */
  async pair() {
    const status = this.host.plugin.bridge.pairing()
    if (!status) throw new Error("the bridge is not running")
    return await this.controller.pair(status.manualCode)
  }

  /** the last value a signal emitted, as a plain value */
  last(id: string) {
    return (this.host.values(id).at(-1) as { value?: unknown } | undefined)?.value
  }

  /** the values a signal emitted, as plain values */
  values(id: string) {
    return this.host.values(id).map(value => (value as { value?: unknown }).value)
  }

  /** a device's attributes as the controller sees them */
  static seen(peer: ClientNode, name: string) {
    return TestController.device(peer, name).state as DeviceState
  }

  /** a device's attributes on the bridge, by id (seeded devices have their name as id) */
  state(id: string) {
    return this.host.plugin.devices.get(id)!.endpoint.state as unknown as DeviceState
  }

  /** the bridge first, while the controller still answers; the other way round its stop waits for it (see BridgeNode.close) */
  async close() {
    await this.host.stop()
    await this.controller.close()
  }

  /** polls until the check holds; real time, the network is real */
  static async until(check: () => boolean, ms = 5000, what = "condition") {
    const end = performance.now() + ms
    while (!check()) {
      if (performance.now() > end) throw new Error(`timed out waiting for ${what}`)
      await new Promise(resolve => setTimeout(resolve, 20))
    }
  }
}
