import type { BusMessage, EventBus, MessageSource } from "@lox-nexus/core"
import type { DataType, RemotePeer } from "@lox-nexus/ici"
import { Disposable } from "@lox-nexus/plugin-sdk"
import { IciValueMapper } from "./IciValueMapper.ts"
import type { LoxoneTopics } from "./LoxoneTopics.ts"
import type { SignalLookup } from "./SignalLookup.ts"

/**
 * Sends every value delivered on an out-signal's topic to the Miniserver, including forced values
 * and values restored at startup: the Miniserver should get the last known value after a restart.
 */
export class OutboundRouter extends Disposable {
  constructor(
    bus: Pick<EventBus, "subscribe" | "event">,
    private readonly peer: RemotePeer,
    private readonly topics: LoxoneTopics,
    private readonly signals: SignalLookup,
    private readonly source: MessageSource
  ) {
    super()
    this.own(bus.subscribe(topics.outPattern, message => this.onMessage(message, bus)))
    this.listen(peer, "sendError", (error: Error, packetId: string) =>
      bus.event(topics.errors, `resending ${packetId} failed: ${error.message}`, { source }))
  }

  private onMessage(message: BusMessage, bus: Pick<EventBus, "event">) {
    if ((message.kind !== "state" && message.kind !== "command") || !message.value) return
    const signal = this.signals.outputFor(message.topic)
    if (!signal) return
    const dataType = signal.dataType as DataType
    this.peer.output(signal.packetId, dataType).set(IciValueMapper.toIci(dataType, message.value)).catch((error: unknown) => {
      const text = error instanceof Error ? error.message : String(error)
      bus.event(this.topics.errors, `sending ${signal.packetId} failed: ${text}`, { source: this.source, cause: message })
    })
  }
}
