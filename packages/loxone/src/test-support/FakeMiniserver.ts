import { once } from "node:events"
import { IciReceiver, IciSocket, RemotePeer, type DataEvent, type DataType, type ValueMap } from "@lox-nexus/ici"

/** A Miniserver stand-in on 127.0.0.1: sends as "server" to "claude" and records what Nexus sends back. */
export class FakeMiniserver {
  /** a real 0x8D heartbeat captured from the test Miniserver, whose id is "server" */
  static readonly STATUS_FROM_SERVER = Buffer.from("8d000000eb23a294736572766572000000000000000000000000000064", "hex")
  /** the same heartbeat claiming to come from "other" */
  static readonly STATUS_FROM_OTHER = Buffer.from("8d000000eb23a2946f7468657200000000000000000000000000000064", "hex")
  readonly socket = new IciSocket()
  private receiver: IciReceiver | undefined
  private peer: RemotePeer | undefined
  private nexusPort: number | undefined

  async start() {
    await this.socket.bind(0, "127.0.0.1")
    this.receiver = new IciReceiver(this.socket, { ownId: "server" })
    return this.socket.address()!.port
  }

  /** where Nexus listens; known only after the Miniserver under test started (and again after a restart) */
  connect(nexusPort: number) {
    this.peer?.close()
    this.nexusPort = nexusPort
    this.peer = new RemotePeer(this.socket, { ownId: "server", remoteId: "claude", host: "127.0.0.1", port: nexusPort, resendInterval: 0 })
  }

  send<T extends DataType>(packetId: string, type: T, value: ValueMap[T]) {
    return this.peer!.output(packetId, type).set(value)
  }

  /** sends the same value again, like the Miniserver's 10 s resend */
  resend<T extends DataType>(packetId: string, type: T) {
    return this.peer!.output(packetId, type).resend()
  }

  sendRaw(buffer: Buffer) {
    return this.socket.send(buffer, this.nexusPort!, "127.0.0.1")
  }

  /** resolves with the next packet Nexus sends with this packet id; rejects after `timeoutMs` so a lost packet fails the test instead of hanging it */
  async received(packetId: string, timeoutMs = 2000): Promise<DataEvent> {
    const signal = AbortSignal.timeout(timeoutMs)
    for (;;) {
      const [event] = await once(this.receiver!, "data", { signal }) as [DataEvent]
      if (event.packet.packetId === packetId) return event
    }
  }

  async stop() {
    this.peer?.close()
    this.receiver?.dispose()
    await this.socket.close()
  }
}
