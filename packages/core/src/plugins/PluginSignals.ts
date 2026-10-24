import { Disposable, type DisposableLike } from "@lox-nexus/plugin-sdk"
import type { Value } from "@lox-nexus/plugin-sdk/values"
import type { SignalSpec } from "@lox-nexus/plugin-sdk/wire"
import { BoundedIndex } from "../bus/BoundedIndex.ts"
import type { BusMessage, Cause, MessageSource } from "../bus/BusMessage.ts"
import type { EventBus } from "../bus/EventBus.ts"
import type { Signal } from "../wires/Signal.ts"
import type { SignalRegistry } from "../wires/SignalRegistry.ts"
import { PluginTopics } from "./PluginTopics.ts"
import type { PluginInstanceConfig, PluginPackage, PluginSignalConfig, SignalValueType } from "./PluginTypes.ts"

/** The slice of EventBus the plugin side needs. */
export type PluginBus = Pick<EventBus, "publish" | "subscribe" | "result" | "event">

/** A configured signal with its topic and, when the plugin refused it, why. */
export interface PluginSignalEntry {
  config: PluginSignalConfig
  topic: string
  valueType: SignalValueType
  error?: string
}

/**
 * The configured signals of one instance on the bus. They are registered in the SignalRegistry
 * even while the plugin is stopped, so wires can be built. Commands on actuator topics are handed
 * to `actuate`; values the plugin emits are published under the bus message that caused them.
 */
export class PluginSignals extends Disposable {
  /** actuations whose effects may still arrive; older causes fall back to a fresh trace */
  static readonly CAUSES = 1000
  private readonly entries = new Map<string, PluginSignalEntry & { subscription?: DisposableLike }>()
  private readonly causes = new BoundedIndex<Cause>(PluginSignals.CAUSES)
  private topics: PluginTopics

  constructor(
    private instance: PluginInstanceConfig,
    /** read on every use: a development reload replaces the package and its capabilities */
    private readonly pkg: () => PluginPackage,
    private readonly bus: PluginBus,
    private readonly registry: Pick<SignalRegistry, "register" | "unregister" | "update">,
    private readonly actuate: (signalId: string, value: Value, cause: BusMessage) => void
  ) {
    super()
    this.topics = new PluginTopics(instance)
    this.onDispose(() => this.entries.forEach(entry => void entry.subscription?.dispose()))
  }

  /**
   * Registers the signal (and, for an actuator, listens for commands).
   * @throws Error for a capability the plugin doesn't offer, a duplicate id or a taken topic
   */
  add(config: PluginSignalConfig) {
    if (this.entries.has(config.id)) throw new Error(`signal "${config.id}" already exists`)
    const entry = this.entryFor(config)
    this.registry.register(this.signalOf(entry))
    this.entries.set(config.id, { ...entry, ...this.subscribe(entry) })
    return entry
  }

  /** Replaces a signal's config (same id); its wires stay. @throws like add() */
  update(config: PluginSignalConfig) {
    const previous = this.entries.get(config.id)
    if (!previous) throw new Error(`unknown signal "${config.id}"`)
    const entry = this.entryFor(config)
    this.registry.update(this.signalOf(entry))
    void previous.subscription?.dispose()
    this.entries.set(config.id, { ...entry, ...this.subscribe(entry) })
    return entry
  }

  /** unregisters the signal, which also removes its wires; false for an unknown id */
  remove(id: string) {
    const entry = this.entries.get(id)
    if (!entry) return false
    this.entries.delete(id)
    void entry.subscription?.dispose()
    this.registry.unregister(id)
    return true
  }

  /** a new instance slug moves every topic; wires survive because they refer to ids */
  rename(instance: PluginInstanceConfig) {
    this.instance = instance
    this.topics = new PluginTopics(instance)
    for (const entry of [...this.entries.values()]) this.update(entry.config)
  }

  /** undefined for unknown ids */
  get(id: string): PluginSignalEntry | undefined {
    return this.list().find(entry => entry.config.id === id)
  }

  list(): PluginSignalEntry[] {
    return [...this.entries.values()].map(({ config, topic, valueType, error }) => ({ config, topic, valueType, ...(error ? { error } : {}) }))
  }

  /** what the worker needs to recreate every signal after a (re)start */
  specs(): Array<SignalSpec & { id: string }> {
    return [...this.entries.values()].map(({ config }) => ({ id: config.id, kind: config.kind, capability: config.capability, params: config.params }))
  }

  /** remembers why the plugin was told to act, so what it emits meanwhile continues that trace */
  rememberCause(message: BusMessage) {
    this.causes.set(message.id, message)
  }

  /** a sensor's value from the plugin; values for unknown ids or actuators are dropped */
  publish(signalId: string, value: Value, causeId: string | undefined) {
    const entry = this.entries.get(signalId)
    if (entry?.config.kind !== "sensor") return
    const cause = causeId === undefined ? undefined : this.causes.get(causeId)
    this.bus.publish(entry.topic, value, { source: this.source, ...(cause ? { cause } : {}) })
  }

  /** marks a signal as refused (or working again with undefined) */
  setError(signalId: string, error: string | undefined) {
    const entry = this.entries.get(signalId)
    if (!entry) return
    if (error === undefined) delete entry.error
    else entry.error = error
  }

  get source(): MessageSource {
    return { kind: "plugin", id: this.instance.id, label: this.instance.label }
  }

  private entryFor(config: PluginSignalConfig): PluginSignalEntry {
    const { description, name } = this.pkg()
    const offered = config.kind === "sensor" ? description.sensors : description.actuators
    const capability = offered.find(candidate => candidate.id === config.capability)
    if (!capability) throw new Error(`${name} has no ${config.kind} "${config.capability}"`)
    return { config, topic: this.topics.forSignal(config), valueType: capability.valueType }
  }

  private signalOf(entry: PluginSignalEntry): Signal {
    const sensor = entry.config.kind === "sensor"
    return {
      id: entry.config.id, topic: entry.topic, label: entry.config.label, valueType: entry.valueType,
      direction: sensor ? "source" : "target", delivery: sensor ? "state" : "command"
    }
  }

  // forced actuator topics deliver their value as a command too, so the plugin acts on it
  private subscribe(entry: PluginSignalEntry) {
    if (entry.config.kind !== "actuator") return {}
    const subscription = this.bus.subscribe(entry.topic, message => {
      if (message.kind === "command" && message.value) this.actuate(entry.config.id, message.value, message)
    })
    return { subscription }
  }
}
