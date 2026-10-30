import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Environment, Logger, LogLevel, Seconds, ServerNode, type ClientNode, type Endpoint } from "@matter/main"
import { FreePort } from "./FreePort.ts"

/**
 * A matter.js controller in the test process, standing in for Alexa: it pairs the bridge and talks
 * to its devices. Its storage lives in a temporary directory that close() removes.
 */
export class TestController {
  private static count = 0

  private constructor(readonly node: ServerNode, readonly directory: string) {}

  static async start() {
    const directory = await mkdtemp(join(tmpdir(), "matter-bridge-test-"))
    Environment.default.vars.set("storage.path", directory)
    // matter.js logs to the console once no bridge routes its log; the tests' output stays clean
    if ("default" in Logger.destinations) Logger.destinations.default.level = LogLevel.WARN
    const node = await ServerNode.create({
      id: `test-controller-${process.pid}-${++TestController.count}`,
      network: { port: await FreePort.udp() },
      commissioning: { enabled: false }
    })
    await node.start()
    return new TestController(node, directory)
  }

  /** pairs with the 11-digit code; resolves with the bridge as a peer */
  async pair(pairingCode: string): Promise<ClientNode> {
    return await this.node.peers.commission({ pairingCode, timeout: Seconds(30) })
  }

  /** the bridged endpoint whose label is `name` */
  static device(peer: ClientNode, name: string): Endpoint {
    const all = (endpoint: Endpoint): Endpoint[] => [endpoint, ...endpoint.parts.map(all).flat()]
    const found = all(peer).find(endpoint => (endpoint.state as { bridgedDeviceBasicInformation?: { nodeLabel?: string } }).bridgedDeviceBasicInformation?.nodeLabel === name)
    if (!found) throw new Error(`the bridge has no device "${name}"`)
    return found
  }

  async close() {
    await this.node.close()
    await rm(this.directory, { recursive: true, force: true })
  }
}
