import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Environment, Logger, LogLevel, Seconds, ServerNode, type ClientNode, type Endpoint } from "@matter/main"
import { QrPairingCodeCodec } from "@matter/main/types"
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

  /**
   * Pairs with the QR payload ("MT:…") or the 11-digit code; resolves with the bridge as a peer. The
   * QR payload carries the bridge's 12-bit discriminator, the manual code only 4 bits of it: with
   * bridges of parallel test files on the same loopback mDNS, a manual code finds several and
   * tries the passcode on each until it times out.
   */
  async pair(code: string): Promise<ClientNode> {
    if (!code.startsWith("MT:")) return await this.node.peers.commission({ pairingCode: code, timeout: Seconds(30) })
    const [payload] = QrPairingCodeCodec.decode(code)
    if (!payload) throw new Error("the QR payload holds no device")
    return await this.node.peers.commission({ passcode: payload.passcode, discriminator: payload.discriminator, timeout: Seconds(30) })
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
