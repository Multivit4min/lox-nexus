import type { Clock, EventBus, MessageSource } from "@lox-nexus/core"
import { IciReceiver, IciSocket, RemotePeer } from "@lox-nexus/ici"
import { Disposable } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { DiscoveryList } from "./DiscoveryList.ts"
import { HealthMonitor, type MiniserverHealth } from "./HealthMonitor.ts"
import { InboundRouter } from "./InboundRouter.ts"
import type { LoxoneSignalEntry } from "./LoxoneSignals.ts"
import type { LoxoneTopics } from "./LoxoneTopics.ts"
import type { MiniserverConfig } from "./MiniserverConfig.ts"
import { OutboundRouter } from "./OutboundRouter.ts"
import { ProblemReporter } from "./ProblemReporter.ts"
import type { SignalLookup } from "./SignalLookup.ts"

export type MiniserverBus = Pick<EventBus, "publish" | "subscribe" | "event" | "current">

/** Everything that exists while a Miniserver runs: socket, receiver, peer, routers and health. Disposing closes it all. */
export class MiniserverConnection extends Disposable {
  private readonly socket = new IciSocket()
  private readonly problems: ProblemReporter
  private outbound: OutboundRouter | undefined
  readonly health: HealthMonitor

  constructor(
    private readonly config: MiniserverConfig,
    private readonly bus: MiniserverBus,
    private readonly topics: LoxoneTopics,
    private readonly signals: SignalLookup,
    private readonly discovery: DiscoveryList,
    private readonly clock: Clock
  ) {
    super()
    this.problems = new ProblemReporter(bus, topics.errors, this.source, clock)
    this.health = this.own(new HealthMonitor(clock, health => this.publishHealth(health)))
    this.listen(this.socket, "socketError", (error: Error) => this.problems.report("socket", `socket error: ${error.message}`))
  }

  private get source(): MessageSource {
    return { kind: "loxone", id: this.config.id, label: this.config.label }
  }

  /** binds the listen port and starts routing; rejects (and stays closed) if the port is taken */
  async open() {
    await this.socket.bind(this.config.listenPort, this.config.listenAddress)
    this.onDispose(() => this.socket.close())
    const { ownId, remoteId, host, port, password, resendInterval } = this.config
    const receiver = new IciReceiver(this.socket, { ownId, sourceIds: [remoteId], ...(password ? { password } : {}) })
    this.onDispose(() => receiver.dispose())
    this.reportReceiverProblems(receiver)
    const peer = new RemotePeer(this.socket, { ownId, remoteId, host, port, resendInterval })
    this.onDispose(() => peer.close())
    const { bus, topics, signals, discovery, clock, source, problems, health } = this
    this.own(new InboundRouter(receiver, { bus, topics, source, remoteId, signals, discovery, health, problems, clock }))
    this.outbound = this.own(new OutboundRouter(bus, peer, topics, signals, problems))
    this.publishHealth(health.health)
  }

  /** the port actually bound, useful when listenPort was 0 */
  get listenPort() {
    return this.socket.address()?.port
  }

  /** a signal was configured while running: a new output gets the current value right away */
  signalAdded(entry: LoxoneSignalEntry) {
    if (entry.config.direction === "out") this.outbound?.sync(entry)
  }

  signalRemoved(entry: LoxoneSignalEntry) {
    if (entry.config.direction === "out") this.outbound?.forget(entry)
  }

  // a wrong password shows up as "decryption failed"; without these the UI would only show "waiting"
  private reportReceiverProblems(receiver: IciReceiver) {
    this.listen(receiver, "malformed", (reason: string) => this.problems.report("malformed", `dropped a malformed packet: ${reason}`))
    this.listen(receiver, "encrypted", () => this.problems.report("encrypted", "received an encrypted packet, but no password is configured"))
    this.listen(receiver, "listenerError", (error: unknown) => this.problems.report("listener", `handling a packet failed: ${ProblemReporter.message(error)}`))
  }

  private publishHealth(health: MiniserverHealth) {
    this.bus.publish(this.topics.status, Value.string(health), { source: this.source })
  }
}
