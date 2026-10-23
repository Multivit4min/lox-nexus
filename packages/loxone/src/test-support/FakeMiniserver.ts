import { once } from "node:events"
import { IciReceiver, IciSocket, RemotePeer, type DataEvent, type DataType, type ValueMap } from "@lox-nexus/ici"

/** A Miniserver stand-in on 127.0.0.1: sends as "server" to "claude" and records what Nexus sends back. */
export class FakeMiniserver {
  readonly socket = new IciSocket()
  private receiver: IciReceiver | undefined
  private peer: RemotePeer | undefined

  async start() {
    await this.socket.bind(0, "127.0.0.1")
    this.receiver = new IciReceiver(this.socket, { ownId: "server" })
    return this.socket.address()!.port
  }

  /** where Nexus listens; known only after the Miniserver under test started */
  connect(nexusPort: number) {
    this.peer = new RemotePeer(this.socket, { ownId: "server", remoteId: "claude", host: "127.0.0.1", port: nexusPort, resendInterval: 0 })
  }

  send<T extends DataType>(packetId: string, type: T, value: ValueMap[T]) {
    return this.peer!.output(packetId, type).set(value)
  }

  /** resolves with the next packet Nexus sends with this packet id */
  async received(packetId: string): Promise<DataEvent> {
    for (;;) {
      const [event] = await once(this.receiver!, "data") as [DataEvent]
      if (event.packet.packetId === packetId) return event
    }
  }

  async stop() {
    this.peer?.close()
    this.receiver?.dispose()
    await this.socket.close()
  }
}
