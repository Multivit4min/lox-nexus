import { SystemClock, type Clock, type MessageSource, type Signal, type SignalRegistry } from "@lox-nexus/core"
import { Disposable } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { DiscoveryList } from "./DiscoveryList.ts"
import { IciValueMapper } from "./IciValueMapper.ts"
import { LoxoneSignals, type LoxoneSignalEntry } from "./LoxoneSignals.ts"
import { LoxoneTopics } from "./LoxoneTopics.ts"
import { MiniserverConnection, type MiniserverBus } from "./MiniserverConnection.ts"
import { LoxoneSignalConfigSchema, type LoxoneSignalConfigInput, type MiniserverConfig } from "./MiniserverConfig.ts"
import { ProblemReporter } from "./ProblemReporter.ts"

export interface MiniserverDeps {
  bus: MiniserverBus
  signals: SignalRegistry
  clock?: Clock
}

/**
 * One Miniserver: its configured signals (registered on the bus even while stopped, so wires can
 * be built) and, while running, a MiniserverConnection.
 *
 * start(), stop() and update() run one after another, so a double click on "start" or a stop
 * during a start can't leak a socket. Disposing is shutdown: it stops the connection but leaves
 * the signals registered (their wires belong to the user); MiniserverManager.remove() deletes.
 */
export class Miniserver extends Disposable {
  readonly discovery = new DiscoveryList()
  private readonly entries = new LoxoneSignals()
  private readonly clock: Clock
  private current: MiniserverConfig
  private currentTopics: LoxoneTopics
  private connection: MiniserverConnection | undefined
  private lifecycle: Promise<unknown> = Promise.resolve()
  private failure: string | undefined

  constructor(config: MiniserverConfig, private readonly deps: MiniserverDeps) {
    super()
    this.current = config
    this.currentTopics = new LoxoneTopics(config.slug)
    this.clock = deps.clock ?? new SystemClock()
    this.onDispose(() => this.serialize(() => this.close()))
    this.publishStopped()
  }

  /** includes the password; strip it before sending the config anywhere */
  get config() {
    return this.current
  }

  get topics() {
    return this.currentTopics
  }

  get isRunning() {
    return this.connection !== undefined
  }

  get health() {
    return this.connection?.health.health ?? "stopped"
  }

  /** why the last start failed; cleared by a successful start */
  get lastError() {
    return this.failure
  }

  /** the bound listen port while running */
  get listenPort() {
    return this.connection?.listenPort
  }

  /** @throws when the port can't be bound (see lastError), or when the Miniserver is disposed */
  start(): Promise<void> {
    if (this.isDisposed) return Promise.reject(new Error(`miniserver "${this.current.id}" is disposed`))
    return this.serialize(() => this.open())
  }

  stop(): Promise<void> {
    return this.serialize(() => this.close())
  }

  /**
   * Applies a new config (same id) and restarts if it was running. A new slug re-keys every
   * signal's topic; wires survive because they refer to signal ids.
   */
  update(config: MiniserverConfig): Promise<void> {
    if (config.id !== this.current.id) return Promise.reject(new Error("the id of a miniserver cannot change"))
    return this.serialize(async () => {
      const wasRunning = this.connection !== undefined
      await this.close()
      if (config.slug !== this.current.slug) this.rename(config.slug)
      this.current = config
      if (wasRunning && !this.isDisposed) await this.open()
    })
  }

  /** registers a signal on the bus; throws if the id, the topic or the packet id (per direction) is taken */
  addSignal(input: LoxoneSignalConfigInput) {
    const config = LoxoneSignalConfigSchema.parse(input)
    const entry = this.entries.add(config, this.currentTopics.forSignal(config))
    try {
      this.deps.signals.register(Miniserver.signalOf(entry))
    } catch (error) {
      this.entries.remove(config.id)
      throw error
    }
    this.discovery.forget(config.packetId)
    this.connection?.signalAdded(entry)
    return config
  }

  /** unregisters the signal, which also removes its wires */
  removeSignal(id: string) {
    const entry = this.entries.remove(id)
    if (!entry) return false
    this.deps.signals.unregister(id)
    this.connection?.signalRemoved(entry)
    return true
  }

  /** used when the Miniserver is deleted */
  removeAllSignals() {
    for (const entry of this.entries.list()) this.removeSignal(entry.config.id)
  }

  signals() {
    return this.entries.list().map(entry => entry.config)
  }

  /** the bus topic of a configured signal */
  topicOf(id: string) {
    return this.entries.get(id)?.topic
  }

  private serialize(work: () => Promise<void>): Promise<void> {
    const next = this.lifecycle.then(work)
    this.lifecycle = next.catch(() => undefined)
    return next
  }

  private async open() {
    if (this.connection) return
    const connection = new MiniserverConnection(this.current, this.deps.bus, this.currentTopics, this.entries, this.discovery, this.clock)
    try {
      await connection.open()
    } catch (error) {
      this.failure = ProblemReporter.message(error)
      // the bind error is what matters; a cleanup failure must not replace it
      await connection.dispose().catch(() => undefined)
      this.deps.bus.event(this.currentTopics.errors, `start failed: ${this.failure}`, { source: this.source })
      throw error
    }
    this.failure = undefined
    this.connection = connection
  }

  private async close() {
    const connection = this.connection
    this.connection = undefined
    await connection?.dispose()
  }

  private rename(slug: string) {
    this.currentTopics = new LoxoneTopics(slug)
    for (const entry of this.entries.retopic(config => this.currentTopics.forSignal(config))) {
      this.deps.signals.update(Miniserver.signalOf(entry))
    }
    this.publishStopped()
  }

  // a status topic without a value would leave the UI guessing until the first start
  private publishStopped() {
    this.deps.bus.publish(this.currentTopics.status, Value.string("stopped"), { source: this.source })
  }

  private get source(): MessageSource {
    return { kind: "loxone", id: this.current.id, label: this.current.label }
  }

  private static signalOf({ config, topic }: LoxoneSignalEntry): Signal {
    return {
      id: config.id, topic, label: config.label,
      direction: config.direction === "in" ? "source" : "target",
      valueType: IciValueMapper.valueTypeOf(config.dataType),
      delivery: "state"
    }
  }
}
