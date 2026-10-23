import type { Clock, EventBus, MessageSource } from "@lox-nexus/core"
import { IciReceiver, IciSocket, RemotePeer } from "@lox-nexus/ici"
import { Disposable } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { DiscoveryList } from "./DiscoveryList.ts"
import { HealthMonitor, type MiniserverHealth } from "./HealthMonitor.ts"
import { InboundRouter } from "./InboundRouter.ts"
import type { LoxoneTopics } from "./LoxoneTopics.ts"
import type { MiniserverConfig } from "./MiniserverConfig.ts"
import { OutboundRouter } from "./OutboundRouter.ts"
import type { SignalLookup } from "./SignalLookup.ts"

export type MiniserverBus = Pick<EventBus, "publish" | "subscribe" | "event">

/** Everything that exists while a Miniserver runs: socket, receiver, peer, routers and health. Disposing closes it all. */
export class MiniserverConnection extends Disposable {
  private readonly socket = new IciSocket()
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
    this.health = this.own(new HealthMonitor(clock, health => this.publishHealth(health)))
  }

  private get source(): MessageSource {
    return { kind: "loxone", id: this.config.id, label: this.config.label }
  }

  /** binds the listen port and starts routing; rejects (and stays closed) if the port is taken */
  async open() {
    await this.socket.bind(this.config.listenPort)
    this.onDispose(() => this.socket.close())
    const { ownId, remoteId, host, port, password, resendInterval } = this.config
    const receiver = new IciReceiver(this.socket, { ownId, sourceIds: [remoteId], ...(password ? { password } : {}) })
    this.onDispose(() => receiver.dispose())
    const peer = new RemotePeer(this.socket, { ownId, remoteId, host, port, resendInterval })
    this.onDispose(() => peer.close())
    const { bus, topics, signals, discovery, clock, source } = this
    this.own(new InboundRouter(receiver, { bus, topics, source, signals, discovery, health: this.health, clock }))
    this.own(new OutboundRouter(bus, peer, topics, signals, source))
    this.publishHealth(this.health.health)
  }

  /** the port actually bound, useful when listenPort was 0 */
  get listenPort() {
    return this.socket.address()?.port
  }

  private publishHealth(health: MiniserverHealth) {
    this.bus.publish(this.topics.status, Value.string(health), { source: this.source })
  }
}
