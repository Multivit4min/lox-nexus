import type { Clock, EventBus, MessageSource } from "@lox-nexus/core"
import type { DataEvent, IciReceiver } from "@lox-nexus/ici"
import { Disposable } from "@lox-nexus/plugin-sdk"
import { Converter } from "@lox-nexus/plugin-sdk/values"
import type { DiscoveryList } from "./DiscoveryList.ts"
import type { HealthMonitor } from "./HealthMonitor.ts"
import { IciValueMapper } from "./IciValueMapper.ts"
import type { LoxoneTopics } from "./LoxoneTopics.ts"
import type { SignalLookup } from "./SignalLookup.ts"
import type { DataType } from "@lox-nexus/ici"

export interface InboundContext {
  bus: Pick<EventBus, "publish">
  topics: LoxoneTopics
  source: MessageSource
  signals: SignalLookup
  discovery: DiscoveryList
  health: HealthMonitor
  clock: Clock
}

/** Turns packets from the Miniserver into bus states: configured inputs, or discovered packet ids. */
export class InboundRouter extends Disposable {
  constructor(receiver: IciReceiver, private readonly context: InboundContext) {
    super()
    this.listen(receiver, "data", (event: DataEvent) => this.onData(event))
    this.listen(receiver, "status", () => context.health.seen())
  }

  private onData({ packet, value, changed }: DataEvent) {
    const { bus, topics, source, signals, discovery, health, clock } = this.context
    health.seen()
    const busValue = IciValueMapper.toBus(packet.dataType, value)
    const input = signals.inputFor(packet.packetId)
    if (!input) {
      discovery.record(packet, busValue, clock.now())
      if (changed && busValue) bus.publish(topics.discovered(packet.packetId), busValue, { source })
      return
    }
    // the 10 s resends repeat unchanged values; the bus would drop them anyway
    if (!changed || !busValue) return
    const typed = Converter.convert(busValue, IciValueMapper.valueTypeOf(input.config.dataType as DataType))
    bus.publish(input.topic, typed, { source })
  }
}
