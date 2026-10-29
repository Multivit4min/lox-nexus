import net from "node:net"
import type { AddressInfo } from "node:net"

/**
 * A broker that accepts the connection (CONNACK) and then never answers again: no PUBACK, no
 * SUBACK. For timeouts. Closing it ends its side of every connection.
 */
export class SilentBroker {
  private readonly sockets = new Set<net.Socket>()

  private constructor(private readonly server: net.Server) {
    server.on("connection", socket => {
      this.sockets.add(socket)
      socket.on("close", () => this.sockets.delete(socket))
      socket.once("data", () => socket.write(Buffer.from([0x20, 0x02, 0x00, 0x00])))
    })
  }

  static async start() {
    const broker = new SilentBroker(net.createServer())
    await new Promise<void>(resolve => broker.server.listen(0, "127.0.0.1", resolve))
    return broker
  }

  get url() {
    return `mqtt://127.0.0.1:${(this.server.address() as AddressInfo).port}`
  }

  async close() {
    for (const socket of this.sockets) socket.destroy()
    await new Promise<void>(resolve => this.server.close(() => resolve()))
  }
}
