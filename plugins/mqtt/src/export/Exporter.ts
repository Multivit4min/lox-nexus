import { Disposable, type PluginLogger, type WatchedSignal, type WatchedValue } from "@lox-nexus/plugin-sdk"
import type { BrokerConnection } from "../broker/BrokerConnection.ts"
import { ValuePayload } from "../payload/ValuePayload.ts"
import { Topic } from "../topics/Topic.ts"
import type { ExportRegistry, Announced } from "./ExportRegistry.ts"
import { ExportStats } from "./ExportStats.ts"
import type { HaDiscovery } from "./HaDiscovery.ts"

/**
 * Publishes the values of the watched signals, retained, to `<base>/<signal topic>`, and their
 * Home Assistant discovery configs. Keeps the last payload of each watched signal (one per
 * signal, so memory is bounded by the watch list) and publishes them all again after every
 * connect, so a broker that lost its retained messages is complete again, and a signal's value
 * again when its topic changes (a renamed signal or Miniserver). While disconnected nothing else
 * is buffered.
 *
 * watched() waits until the batch is written, so a slow broker slows the delivery, and Nexus
 * drops the oldest values instead of this plugin piling them up.
 */
export class Exporter extends Disposable {
  readonly stats = new ExportStats()
  /** state topic by signal id */
  private stateTopics = new Map<string, string>()
  /** last payload by signal id */
  private readonly latest = new Map<string, string>()
  private configs = new Map<string, string>()
  /** the configs this connection already has */
  private readonly sentConfigs = new Map<string, string>()
  private flushing = Promise.resolve()

  constructor(
    private readonly connection: BrokerConnection,
    private readonly registry: ExportRegistry,
    private readonly discovery: HaDiscovery | undefined,
    private readonly base: string,
    private readonly log: PluginLogger
  ) {
    super()
    this.listen(connection.events, "connected", () => {
      this.sentConfigs.clear()
      this.flush(true)
    })
  }

  /** retained topics waiting to be removed */
  get pendingClears() {
    return this.registry.clears.length
  }

  get discoveryConfigs() {
    return this.configs.size
  }

  watchChanged(signals: WatchedSignal[]) {
    const announced = new Map<string, Announced>()
    const before = this.stateTopics
    this.stateTopics = new Map()
    this.configs = new Map()
    for (const signal of signals) {
      const state = Topic.join(this.base, signal.topic)
      const config = this.discovery?.topic(signal)
      this.stateTopics.set(signal.id, state)
      if (config) this.configs.set(config, this.discovery?.payload(signal, state) ?? "")
      announced.set(signal.id, { state, config })
    }
    for (const id of this.latest.keys()) if (!this.stateTopics.has(id)) this.latest.delete(id)
    // a config dropped (and cleared) must be sent again when it comes back
    for (const topic of this.sentConfigs.keys()) if (!this.configs.has(topic)) this.sentConfigs.delete(topic)
    const moved = [...this.stateTopics].filter(([id, topic]) => before.has(id) && before.get(id) !== topic).map(([id]) => id)
    this.registry.update(announced)
    if (this.connection.connected) this.flush(moved)
  }

  async watched(values: readonly WatchedValue[], dropped: number) {
    this.stats.droppedByNexus += dropped
    const sends: Promise<boolean>[] = []
    for (const { signalId, value } of values) {
      const topic = this.stateTopics.get(signalId)
      if (topic === undefined || value.type === "null") {
        this.stats.skipped++
        continue
      }
      const payload = ValuePayload.text(value)
      this.latest.set(signalId, payload)
      if (this.connection.connected) sends.push(this.sendValue(topic, payload))
    }
    await Promise.all(sends)
  }

  /**
   * runs flushes one after the other, so removals and configs keep their order
   * @param values the signals whose kept value to publish again: all after a connect, those whose topic moved otherwise
   */
  private flush(values: true | string[]) {
    this.flushing = this.flushing.then(() => this.publishAll(values)).catch((error: unknown) => {
      this.log.warn("export: publishing the kept values and discovery configs failed", { error: error instanceof Error ? error.message : String(error) })
    })
  }

  // removals first, so a config that moved isn't removed after its new one is announced
  private async publishAll(values: true | string[]) {
    const clears = this.registry.clears
    const results = await Promise.all(clears.map(topic => this.send(topic, "", 1)))
    const cleared = clears.filter((_, index) => results[index])
    this.stats.cleared += cleared.length
    this.registry.cleared(cleared)
    for (const topic of cleared) this.sentConfigs.delete(topic)
    const configs = [...this.configs].filter(([topic, payload]) => this.sentConfigs.get(topic) !== payload)
    await Promise.all(configs.map(async ([topic, payload]) => {
      if (await this.send(topic, payload, 1)) this.sentConfigs.set(topic, payload)
    }))
    const ids = values === true ? [...this.latest.keys()] : values
    await Promise.all(ids.map(id => {
      const topic = this.stateTopics.get(id)
      const payload = this.latest.get(id)
      return topic === undefined || payload === undefined ? false : this.sendValue(topic, payload)
    }))
  }

  private async sendValue(topic: string, payload: string) {
    if (!(await this.send(topic, payload, 0))) return false
    this.stats.published++
    this.stats.lastPublishedAt = this.currentClock().now()
    return true
  }

  /** a retained publish; false when it failed (counted) */
  private async send(topic: string, payload: string, qos: 0 | 1) {
    if (this.isDisposed) return false
    try {
      await this.connection.publish(topic, payload, { retain: true, qos })
      return true
    } catch {
      this.stats.failed++
      return false
    }
  }
}
