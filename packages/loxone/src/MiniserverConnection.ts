import type { Clock, EventBus, MessageSource } from "@lox-nexus/core"
import { IciReceiver, RemotePeer, type DataEvent, type IciSocket } from "@lox-nexus/ici"
import { Disposable } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { DiscoveryList } from "./DiscoveryList.ts"
import { CountingSender } from "./CountingSender.ts"
import { HealthMonitor, type MiniserverHealth } from "./HealthMonitor.ts"
import type { IntercomLoad } from "./IntercomLoad.ts"
import { InboundRouter } from "./InboundRouter.ts"
import type { LoxoneSignalEntry } from "./LoxoneSignals.ts"
import type { LoxoneTopics } from "./LoxoneTopics.ts"
import type { MiniserverConfig } from "./MiniserverConfig.ts"
import { OutboundRouter } from "./OutboundRouter.ts"
import { ProblemReporter } from "./ProblemReporter.ts"
import type { SignalLookup } from "./SignalLookup.ts"
import type { SocketPool } from "./SocketPool.ts"

/** The slice of EventBus a connection uses; narrow so tests can pass a real bus or a stub. */
export type MiniserverBus = Pick<EventBus, "publish" | "subscribe" | "event" | "current">

/**
 * Everything that exists while a Miniserver runs: its hold on the (possibly shared) socket,
 * receiver, peer, routers and health. Disposing closes it all and, through the HealthMonitor,
 * publishes "stopped". Not reusable: a restart creates a new connection. Call open() once after
 * construction.
 */
export class MiniserverConnection extends Disposable {
  private socket: IciSocket | undefined
  private readonly problems: ProblemReporter
  private outbound: OutboundRouter | undefined
  /** exposed so Miniserver can report its state without a bus lookup */
  readonly health: HealthMonitor

  /** Only wires up the health monitor and socket error reporting; no IO until open(). */
  constructor(
    private readonly config: MiniserverConfig,
    private readonly bus: MiniserverBus,
    private readonly topics: LoxoneTopics,
    private readonly signals: SignalLookup,
    private readonly discovery: DiscoveryList,
    private readonly clock: Clock,
    private readonly load: Pick<IntercomLoad, "received" | "sent">,
    private readonly sockets: Pick<SocketPool, "acquire">
  ) {
    super()
    this.problems = new ProblemReporter(bus, topics.errors, this.source, clock)
    this.health = this.own(new HealthMonitor(clock, health => this.publishHealth(health)))
  }

  private get source(): MessageSource {
    return { kind: "loxone", id: this.config.id, label: this.config.label }
  }

  /**
   * Binds the listen port, or joins the Miniservers already listening there, and starts routing.
   * Rejects (and stays closed) if the port is taken by something else.
   */
  async open() {
    const lease = await this.sockets.acquire(this.config.listenPort, this.config.listenAddress)
    this.onDispose(() => lease.release())
    const socket = this.socket = lease.socket
    this.listen(socket, "socketError", (error: Error) => this.problems.report("socket", `socket error: ${error.message}`))
    const { ownId, remoteId, host, port, password, resendInterval } = this.config
    const receiver = new IciReceiver(socket, { ownId, sourceIds: [remoteId], ...(password ? { password } : {}) })
    this.onDispose(() => receiver.dispose())
    this.reportReceiverProblems(receiver)
    this.countIncoming(receiver, remoteId)
    const peer = new RemotePeer(new CountingSender(socket, packetId => this.load.sent(packetId)), { ownId, remoteId, host, port, resendInterval })
    this.onDispose(() => peer.close())
    const { bus, topics, signals, discovery, clock, source, problems, health } = this
    this.own(new InboundRouter(receiver, { bus, topics, source, remoteId, signals, discovery, health, problems, clock }))
    this.outbound = this.own(new OutboundRouter(bus, peer, topics, signals, problems))
    this.publishHealth(health.health)
  }

  /** the port actually bound, useful when listenPort was 0 */
  get listenPort() {
    return this.socket?.address()?.port
  }

  /** a signal was configured while running: a new output gets the current value right away */
  signalAdded(entry: LoxoneSignalEntry) {
    if (entry.config.direction === "out") this.outbound?.sync(entry)
  }

  /** a signal was removed while running: an output stops being resent */
  signalRemoved(entry: LoxoneSignalEntry) {
    if (entry.config.direction === "out") this.outbound?.forget(entry)
  }

  // everything the Miniserver sends counts against its limit, including packets for other targets
  // that arrive on our port; packets from anyone else don't
  private countIncoming(receiver: IciReceiver, remoteId: string) {
    const fromMiniserver = (packet: { sourceId: string }) => {
      if (packet.sourceId === remoteId) this.load.received()
    }
    // per signal only for configured inputs: made-up packet ids must not fill PacketTraffic's slots
    this.listen(receiver, "data", (event: DataEvent) => this.load.received(this.signals.inputFor(event.packet.packetId) ? event.packet.packetId : undefined))
    this.listen(receiver, "status", fromMiniserver)
    this.listen(receiver, "foreign", fromMiniserver)
    this.listen(receiver, "encrypted", fromMiniserver)
    this.listen(receiver, "handshake", (_kind: string, packet: { sourceId: string }) => fromMiniserver(packet))
  }

  // a wrong password shows up as "decryption failed"; without these the UI would only show "waiting"
  private reportReceiverProblems(receiver: IciReceiver) {
    this.listen(receiver, "malformed", (reason: string) => this.problems.report("malformed", `dropped a malformed packet: ${reason}`))
    // encrypted packets for other remote systems, or from other Miniservers, can share our port;
    // only ours need a password
    this.listen(receiver, "encrypted", (packet: { targetId: string; sourceId: string }) => {
      if (packet.targetId === this.config.ownId && packet.sourceId === this.config.remoteId) this.problems.report("encrypted", "received an encrypted packet, but no password is configured")
    })
    this.listen(receiver, "listenerError", (error: unknown) => this.problems.report("listener", `handling a packet failed: ${ProblemReporter.message(error)}`))
    // answering is part of sending encrypted, which isn't implemented yet; a challenge means the
    // Miniserver expects it and drops encrypted data from us until then
    this.listen(receiver, "handshake", (kind: string, packet: { sourceId: string }) => {
      if (kind === "challenge" && packet.sourceId === this.config.remoteId) this.problems.report("challenge", "the Miniserver sent an encryption handshake challenge; answering it is not implemented yet")
    })
  }

  private publishHealth(health: MiniserverHealth) {
    this.bus.publish(this.topics.status, Value.string(health), { source: this.source })
  }
}
