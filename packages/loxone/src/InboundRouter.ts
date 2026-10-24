import type { Clock, EventBus, MessageSource } from "@lox-nexus/core"
import { DataType, LoxoneColor, type DataEvent, type IciReceiver, type StatusPacket } from "@lox-nexus/ici"
import { Disposable } from "@lox-nexus/plugin-sdk"
import { Converter } from "@lox-nexus/plugin-sdk/values"
import type { DiscoveryList } from "./DiscoveryList.ts"
import type { HealthMonitor } from "./HealthMonitor.ts"
import { IciValueMapper } from "./IciValueMapper.ts"
import type { LoxoneTopics } from "./LoxoneTopics.ts"
import type { ProblemReporter } from "./ProblemReporter.ts"
import type { SignalLookup } from "./SignalLookup.ts"

/** Collaborators of InboundRouter, bundled because the router needs most of a Miniserver connection. */
export interface InboundContext {
  /** where states are published; only `publish` is needed */
  bus: Pick<EventBus, "publish">
  topics: LoxoneTopics
  /** attached to every published message so the Bus Inspector shows where it came from */
  source: MessageSource
  /** the Miniserver's id; status heartbeats from anyone else don't count */
  remoteId: string
  signals: SignalLookup
  discovery: DiscoveryList
  health: HealthMonitor
  problems: ProblemReporter
  clock: Clock
}

/**
 * Turns packets from the Miniserver into bus states: configured inputs, or discovered packet ids.
 * Any data packet and any status heartbeat from the configured remote id feeds the HealthMonitor.
 * Its listeners are owned, so disposing detaches it from the receiver.
 */
export class InboundRouter extends Disposable {
  /** starts listening to `receiver` immediately */
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
    const input = signals.inputFor(packet.packetId)
    const color = InboundRouter.colorOf(packet, value, input?.config.lumitech === true)
    const busValue = color ? IciValueMapper.colorToBus(color) : IciValueMapper.toBus(packet.dataType, value)
    if (!input) {
      discovery.record(packet, busValue, clock.now())
      if (changed && busValue) bus.publish(topics.discovered(packet.packetId), busValue, { source })
      return
    }
    // type mismatches are converted rather than dropped, so a mis-set data type still delivers
    if (!busValue) return problems.report(`type:${packet.packetId}`, `${packet.packetId}: data type ${packet.dataType} is not supported`)
    if (input.config.lumitech) {
      // a Smart RGBW payload is fine as rgbw; anything else that isn't a colour number is suspicious
      if (!color && packet.dataType === DataType.Analog) {
        problems.report(`lumitech:${packet.packetId}`, `${packet.packetId} is a Lumitech signal but got ${String(value)}, which is not a Loxone colour number`)
      }
      bus.publish(input.topic, busValue, { source })
      return
    }
    if (color) {
      problems.report(`lumitech:${packet.packetId}`, `${packet.packetId} carries Loxone colour numbers (a Lumitech output); turn on "Lumitech" for this signal to keep colour temperatures`)
    }
    const expected = IciValueMapper.valueTypeOf(input.config.dataType)
    if (busValue.type !== expected && !color) {
      problems.report(`type:${packet.packetId}`, `${packet.packetId} arrives as ${busValue.type} but is configured as ${expected}; converting`)
    }
    // Unchanged resends are published too: the bus drops equal states anyway, and a value the
    // receiver saw before the signal was configured (e.g. while it was only discovered) must arrive.
    bus.publish(input.topic, Converter.convert(busValue, expected), { source })
  }

  // An RGBW payload that is really a colour number's double is decoded whatever the signal says
  // (a real RGBW value never looks like one); an Analog number only when the signal is Lumitech,
  // since plain numbers like 100 are colour numbers too.
  private static colorOf(packet: DataEvent["packet"], value: unknown, lumitech: boolean) {
    if (packet.dataType === DataType.SmartRgbw) return LoxoneColor.fromRgbwPayload(packet.payload)
    if (packet.dataType === DataType.Analog && lumitech && typeof value === "number") return LoxoneColor.parse(value)
    return undefined
  }
}
