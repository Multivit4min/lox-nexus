import type { Clock, EventBus, MessageSource } from "@lox-nexus/core"
import type { DataEvent, IciReceiver, StatusPacket } from "@lox-nexus/ici"
import { Disposable } from "@lox-nexus/plugin-sdk"
import { Converter } from "@lox-nexus/plugin-sdk/values"
import type { DiscoveryList } from "./DiscoveryList.ts"
import type { HealthMonitor } from "./HealthMonitor.ts"
import { IciValueMapper } from "./IciValueMapper.ts"
import type { LoxoneTopics } from "./LoxoneTopics.ts"
import type { ProblemReporter } from "./ProblemReporter.ts"
import type { SignalLookup } from "./SignalLookup.ts"

export interface InboundContext {
  bus: Pick<EventBus, "publish">
  topics: LoxoneTopics
  source: MessageSource
  /** the Miniserver's id; status heartbeats from anyone else don't count */
  remoteId: string
  signals: SignalLookup
  discovery: DiscoveryList
  health: HealthMonitor
  problems: ProblemReporter
  clock: Clock
}

/** Turns packets from the Miniserver into bus states: configured inputs, or discovered packet ids. */
export class InboundRouter extends Disposable {
  constructor(receiver: IciReceiver, private readonly context: InboundContext) {
    super()
    this.listen(receiver, "data", (event: DataEvent) => this.onData(event))
    this.listen(receiver, "status", (packet: StatusPacket) => {
      if (packet.sourceId === context.remoteId) context.health.seen()
    })
  }

  private onData({ packet, value, changed }: DataEvent) {
    const { bus, topics, source, signals, discovery, health, problems, clock } = this.context
    health.seen()
    const busValue = IciValueMapper.toBus(packet.dataType, value)
    const input = signals.inputFor(packet.packetId)
    if (!input) {
      discovery.record(packet, busValue, clock.now())
      if (changed && busValue) bus.publish(topics.discovered(packet.packetId), busValue, { source })
      return
    }
    if (!busValue) return problems.report(`type:${packet.packetId}`, `${packet.packetId}: data type ${packet.dataType} is not supported`)
    const expected = IciValueMapper.valueTypeOf(input.config.dataType)
    if (busValue.type !== expected) {
      problems.report(`type:${packet.packetId}`, `${packet.packetId} arrives as ${busValue.type} but is configured as ${expected}; converting`)
    }
    // Unchanged resends are published too: the bus drops equal states anyway, and a value the
    // receiver saw before the signal was configured (e.g. while it was only discovered) must arrive.
    bus.publish(input.topic, Converter.convert(busValue, expected), { source })
  }
}
