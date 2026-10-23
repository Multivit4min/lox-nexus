import { SystemClock, type Clock, type SignalRegistry } from "@lox-nexus/core"
import type { DataType } from "@lox-nexus/ici"
import { Disposable } from "@lox-nexus/plugin-sdk"
import { DiscoveryList } from "./DiscoveryList.ts"
import { IciValueMapper } from "./IciValueMapper.ts"
import { LoxoneTopics } from "./LoxoneTopics.ts"
import { MiniserverConnection, type MiniserverBus } from "./MiniserverConnection.ts"
import { LoxoneSignalConfigSchema, type LoxoneSignalConfig, type LoxoneSignalConfigInput, type MiniserverConfig } from "./MiniserverConfig.ts"
import type { SignalLookup } from "./SignalLookup.ts"

export interface MiniserverDeps {
  bus: MiniserverBus
  signals: SignalRegistry
  clock?: Clock
}

/**
 * One Miniserver: its configured signals (registered on the bus even while stopped, so wires can
 * be built) and, while running, a MiniserverConnection.
 */
export class Miniserver extends Disposable implements SignalLookup {
  readonly topics: LoxoneTopics
  readonly discovery = new DiscoveryList()
  private readonly configs = new Map<string, LoxoneSignalConfig>()
  private readonly topicsById = new Map<string, string>()
  private connection: MiniserverConnection | undefined

  constructor(readonly config: MiniserverConfig, private readonly deps: MiniserverDeps) {
    super()
    this.topics = new LoxoneTopics(config.slug)
    this.onDispose(() => this.stop())
    this.onDispose(() => [...this.configs.keys()].forEach(id => this.removeSignal(id)))
  }

  get isRunning() {
    return this.connection !== undefined
  }

  get health() {
    return this.connection?.health.health ?? "stopped"
  }

  /** the bound listen port while running */
  get listenPort() {
    return this.connection?.listenPort
  }

  async start() {
    if (this.connection) return
    const clock = this.deps.clock ?? new SystemClock()
    const connection = new MiniserverConnection(this.config, this.deps.bus, this.topics, this, this.discovery, clock)
    try {
      await connection.open()
    } catch (error) {
      await connection.dispose()
      throw error
    }
    this.connection = connection
  }

  async stop() {
    const connection = this.connection
    this.connection = undefined
    await connection?.dispose()
  }

  /** registers a signal on the bus; throws if the topic or id is already taken */
  addSignal(input: LoxoneSignalConfigInput) {
    const config = LoxoneSignalConfigSchema.parse(input)
    const topic = this.topics.forSignal(config)
    this.deps.signals.register({
      id: config.id, topic, label: config.label,
      direction: config.direction === "in" ? "source" : "target",
      valueType: IciValueMapper.valueTypeOf(config.dataType as DataType),
      delivery: "state"
    })
    this.configs.set(config.id, config)
    this.topicsById.set(config.id, topic)
    this.discovery.forget(config.packetId)
    return config
  }

  removeSignal(id: string) {
    if (!this.configs.delete(id)) return false
    this.topicsById.delete(id)
    this.deps.signals.unregister(id)
    return true
  }

  signals(): LoxoneSignalConfig[] {
    return [...this.configs.values()]
  }

  inputFor(packetId: string) {
    const config = [...this.configs.values()].find(c => c.direction === "in" && c.packetId === packetId)
    return config ? { config, topic: this.topicsById.get(config.id)! } : undefined
  }

  outputFor(topic: string) {
    return [...this.configs.values()].find(c => c.direction === "out" && this.topicsById.get(c.id) === topic)
  }
}
