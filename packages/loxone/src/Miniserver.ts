import { SystemClock, type Clock, type MessageSource, type Signal, type SignalRegistry } from "@lox-nexus/core"
import { Disposable } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { DiscoveryList } from "./DiscoveryList.ts"
import { IntercomLoad, type LoadSample } from "./IntercomLoad.ts"
import type { LoadHistoryStore } from "./LoadHistoryStore.ts"
import { IciValueMapper } from "./IciValueMapper.ts"
import { LoxoneSignals, type LoxoneSignalEntry } from "./LoxoneSignals.ts"
import { LoxoneTopics } from "./LoxoneTopics.ts"
import { MiniserverConnection, type MiniserverBus } from "./MiniserverConnection.ts"
import { LoxoneSignalConfigSchema, type LoxoneSignalConfigInput, type MiniserverConfig } from "./MiniserverConfig.ts"
import { ProblemReporter } from "./ProblemReporter.ts"
import { SocketPool } from "./SocketPool.ts"

/** What a Miniserver needs from the rest of Nexus, passed down from the composition root. */
export interface MiniserverDeps {
  bus: MiniserverBus
  /** where its signals are registered, so wires can refer to them */
  signals: SignalRegistry
  /** replaceable for tests; defaults to the system clock */
  clock?: Clock
  /** keeps the load history across restarts; in memory only without it */
  loadHistory?: LoadHistoryStore
  /** shares sockets between Miniservers on the same listen port; MiniserverManager passes one pool to all */
  sockets?: SocketPool
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
  /** traffic against Loxone's 35 messages/s limit; kept across restarts so the history stays continuous */
  readonly load: IntercomLoad
  private readonly entries = new LoxoneSignals()
  private readonly clock: Clock
  private readonly sockets: SocketPool
  private current: MiniserverConfig
  private currentTopics: LoxoneTopics
  private connection: MiniserverConnection | undefined
  private lifecycle: Promise<unknown> = Promise.resolve()
  private failure: string | undefined

  /**
   * Creates it stopped and publishes the "stopped" status; nothing is bound until start().
   * The config is expected to be validated already (MiniserverManager does that).
   */
  constructor(config: MiniserverConfig, private readonly deps: MiniserverDeps) {
    super()
    this.current = config
    this.currentTopics = new LoxoneTopics(config.slug)
    this.clock = deps.clock ?? new SystemClock()
    this.sockets = deps.sockets ?? new SocketPool()
    const since = this.clock.now() - IntercomLoad.HISTORY_MS
    this.load = this.own(new IntercomLoad(this.clock, sample => this.onLoadSample(sample), deps.loadHistory?.load(config.id, since)))
    this.onDispose(() => this.serialize(() => this.close()))
    this.publishStopped()
  }

  /** includes the password; strip it before sending the config anywhere */
  get config() {
    return this.current
  }

  /** the topic builder for the current slug; replaced when update() changes the slug */
  get topics() {
    return this.currentTopics
  }

  /** true between a successful start() and the next stop(), update() or dispose */
  get isRunning() {
    return this.connection !== undefined
  }

  /** "stopped" while not running, otherwise what the HealthMonitor derived from traffic */
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

  /**
   * Binds the listen port and starts routing; a no-op when already running.
   * @throws when the port can't be bound (see lastError, also published on the error topic), or when the Miniserver is disposed
   */
  start(): Promise<void> {
    if (this.isDisposed) return Promise.reject(new Error(`miniserver "${this.current.id}" is disposed`))
    return this.serialize(() => this.open())
  }

  /** Closes the connection, which publishes "stopped". The signals stay registered. Safe to call when stopped. */
  stop(): Promise<void> {
    return this.serialize(() => this.close())
  }

  /**
   * Applies a new config (same id) and restarts if it was running. A new slug re-keys every
   * signal's topic; wires survive because they refer to signal ids.
   * @throws Error when the id differs, or whatever start does when the restart fails (the new config is kept then)
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

  /**
   * Registers a signal on the bus and, when running, starts routing it (an output sends its current value at once).
   * @returns the validated config with defaults applied
   * @throws ZodError for an invalid config; Error if the id, the topic or the packet id (per direction) is taken
   */
  addSignal(input: LoxoneSignalConfigInput) {
    const config = LoxoneSignalConfigSchema.parse(input)
    const entry = this.entries.add(config, this.currentTopics.forSignal(config))
    try {
      this.deps.signals.register(this.signalOf(entry))
    } catch (error) {
      this.entries.remove(config.id)
      throw error
    }
    this.discovery.forget(config.packetId)
    this.connection?.signalAdded(entry)
    return config
  }

  /**
   * Replaces a signal's config (same id). A new slug, packet id or direction moves its topic; its
   * wires survive because they refer to the id, and are rebuilt by WireEngine (or deactivated if
   * the new type no longer fits). When running, an output sends its current value under the new
   * packet id at once.
   * @returns the validated config with defaults applied
   * @throws ZodError for an invalid config; Error for an unknown id, or a topic or packet id that another signal has (nothing changes then)
   */
  updateSignal(input: LoxoneSignalConfigInput) {
    const config = LoxoneSignalConfigSchema.parse(input)
    const previous = this.entries.remove(config.id)
    if (!previous) throw new Error(`unknown signal "${config.id}"`)
    let entry: LoxoneSignalEntry
    try {
      entry = this.entries.add(config, this.currentTopics.forSignal(config))
      this.deps.signals.update(this.signalOf(entry))
    } catch (error) {
      this.entries.remove(config.id)
      this.entries.add(previous.config, previous.topic)
      throw error
    }
    this.connection?.signalRemoved(previous)
    this.discovery.forget(config.packetId)
    this.connection?.signalAdded(entry)
    return config
  }

  /** unregisters the signal, which also removes its wires; returns false for an unknown id */
  removeSignal(id: string) {
    const entry = this.entries.remove(id)
    if (!entry) return false
    this.deps.signals.unregister(id)
    this.connection?.signalRemoved(entry)
    return true
  }

  /** used when the Miniserver is deleted: unregisters every signal and with them their wires */
  removeAllSignals() {
    for (const entry of this.entries.list()) this.removeSignal(entry.config.id)
  }

  /** configs of all signals, without their topics (see topicOf) */
  signals() {
    return this.entries.list().map(entry => entry.config)
  }

  /**
   * The share of the intercommunication limit of each signal with traffic, in percent, rounded to
   * 3 decimals (2-minute average in the signal's direction, resends included). Signals without
   * traffic are left out, which keeps the polled answer small on Miniservers with thousands.
   */
  signalLoad(): Map<string, number> {
    const shares = this.entries.list().map(({ config }) => [config.id, Math.round(this.load.percentOf(config.direction, config.packetId) * 1000) / 1000] as const)
    return new Map(shares.filter(([, percent]) => percent > 0))
  }

  /** the bus topic of a configured signal; undefined for unknown ids */
  topicOf(id: string) {
    return this.entries.get(id)?.topic
  }

  // Chains work after all earlier lifecycle work. A failure rejects only its own caller; the chain continues.
  private serialize(work: () => Promise<void>): Promise<void> {
    const next = this.lifecycle.then(work)
    this.lifecycle = next.catch(() => undefined)
    return next
  }

  // not idempotent for failures: on error nothing is kept, and lastError says why
  private async open() {
    if (this.connection) return
    const connection = new MiniserverConnection(this.current, this.deps.bus, this.currentTopics, this.entries, this.discovery, this.clock, this.load, this.sockets)
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

  // topics of in-signals move too, so the bus registry is updated for every signal, not just outputs
  private rename(slug: string) {
    this.currentTopics = new LoxoneTopics(slug)
    for (const entry of this.entries.retopic(config => this.currentTopics.forSignal(config))) {
      this.deps.signals.update(this.signalOf(entry))
    }
    this.publishStopped()
  }

  // whole percent on the bus, so it dedups while the load is steady; the store gets the full sample
  private onLoadSample(sample: LoadSample) {
    this.deps.bus.publish(this.currentTopics.load, Value.number(Math.round(sample.percent)), { source: this.source })
    this.deps.loadHistory?.append(this.current.id, sample, sample.ts - IntercomLoad.HISTORY_MS)
  }

  // a status topic without a value would leave the UI guessing until the first start
  private publishStopped() {
    this.deps.bus.publish(this.currentTopics.status, Value.string("stopped"), { source: this.source })
  }

  private get source(): MessageSource {
    return { kind: "loxone", id: this.current.id, label: this.current.label }
  }

  private signalOf({ config, topic }: LoxoneSignalEntry): Signal {
    return {
      id: config.id, topic, label: config.label,
      direction: config.direction === "in" ? "source" : "target",
      valueType: IciValueMapper.signalValueType(config),
      delivery: "state",
      owner: { kind: "miniserver", id: this.current.id }
    }
  }
}
