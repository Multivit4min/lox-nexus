import { createSocket } from "node:dgram"

/** A UDP port nothing listens on right now (IPv4 and IPv6), for a bridge under test. */
export class FreePort {
  static async udp(): Promise<number> {
    const socket = createSocket({ type: "udp6", ipv6Only: false })
    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject)
      socket.bind(0, () => resolve())
    })
    const { port } = socket.address()
    await new Promise<void>(resolve => socket.close(() => resolve()))
    return port
  }
}
