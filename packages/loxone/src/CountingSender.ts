import { PacketDecoder, type DatagramSender } from "@lox-nexus/ici"

/**
 * Passes datagrams on and reports every one the OS accepted, with its packet id; lets IntercomLoad
 * see RemotePeer's sends and resends per signal. Nexus sends unencrypted, so the header is readable.
 */
export class CountingSender implements DatagramSender {
  private readonly decoder = new PacketDecoder()

  constructor(private readonly inner: DatagramSender, private readonly onSent: (packetId: string | undefined) => void) {}

  async send(buffer: Buffer, port: number, host: string) {
    await this.inner.send(buffer, port, host)
    const decoded = this.decoder.decode(buffer)
    this.onSent(decoded.kind === "data" ? decoded.packet.packetId : undefined)
  }
}
