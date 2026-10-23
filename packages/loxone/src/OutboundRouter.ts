import type { BusMessage, Cause, EventBus } from "@lox-nexus/core"
import type { RemotePeer } from "@lox-nexus/ici"
import { Disposable } from "@lox-nexus/plugin-sdk"
import type { Value } from "@lox-nexus/plugin-sdk/values"
import { IciValueMapper } from "./IciValueMapper.ts"
import type { LoxoneSignalEntry } from "./LoxoneSignals.ts"
import type { LoxoneTopics } from "./LoxoneTopics.ts"
import { ProblemReporter } from "./ProblemReporter.ts"
import type { SignalLookup } from "./SignalLookup.ts"

/** The bus slice the router needs: subscribe for changes, current for the initial value. */
export type OutboundBus = Pick<EventBus, "subscribe" | "current">

/**
 * Sends every value delivered on an out-signal's topic to the Miniserver, including forced values.
 * The bus doesn't replay retained values to new subscribers and dedups equal states, so the
 * current value of each output is sent explicitly when the router starts and when an output is
 * added; otherwise a value that never changes would never reach a restarted Miniserver.
 *
 * A release without a real value leaves the forced value on the Miniserver: nothing is delivered
 * then, so there is nothing to send.
 */
export class OutboundRouter extends Disposable {
  /** Subscribes and sends the current value of every existing output right away. Disposing unsubscribes; it does not close the peer. */
  constructor(
    private readonly bus: OutboundBus,
    private readonly peer: RemotePeer,
    topics: LoxoneTopics,
    private readonly signals: SignalLookup,
    private readonly problems: ProblemReporter
  ) {
    super()
    this.own(bus.subscribe(topics.outPattern, message => this.onMessage(message)))
    this.listen(peer, "sendError", (error: Error, packetId: string) =>
      problems.report(`send:${packetId}`, `resending ${packetId} failed: ${error.message}`))
    for (const entry of signals.outputs()) this.sync(entry)
  }

  /** sends what subscribers currently see on the output's topic (the forced value while forced) */
  sync(entry: LoxoneSignalEntry) {
    const current = this.bus.current(entry.topic)
    if (current?.value) this.send(entry, current.value, current)
  }

  /** stops sending and resending a removed output (the Miniserver keeps its last value) */
  forget(entry: LoxoneSignalEntry) {
    this.peer.remove(entry.config.packetId)
  }

  private onMessage(message: BusMessage) {
    if ((message.kind !== "state" && message.kind !== "command") || !message.value) return
    const entry = this.signals.outputFor(message.topic)
    if (entry) this.send(entry, message.value, message)
  }

  // output() and the conversion throw synchronously, set() rejects: both end up as a problem report
  private send(entry: LoxoneSignalEntry, value: Value, cause: Cause) {
    const { packetId, dataType } = entry.config
    const failed = (error: unknown) => this.problems.report(`send:${packetId}`, `sending ${packetId} failed: ${ProblemReporter.message(error)}`, cause)
    try {
      this.peer.output(packetId, dataType).set(IciValueMapper.toIci(dataType, value)).catch(failed)
    } catch (error) {
      failed(error)
    }
  }
}
