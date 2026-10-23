import type { DatagramSender } from "@lox-nexus/ici"

/** Passes datagrams on and reports every one the OS accepted; lets IntercomLoad see RemotePeer's sends and resends. */
export class CountingSender implements DatagramSender {
  constructor(private readonly inner: DatagramSender, private readonly onSent: () => void) {}

  async send(buffer: Buffer, port: number, host: string) {
    await this.inner.send(buffer, port, host)
    this.onSent()
  }
}
