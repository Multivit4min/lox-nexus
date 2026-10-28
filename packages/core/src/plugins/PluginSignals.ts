import { Disposable, type DisposableLike } from "@lox-nexus/plugin-sdk"
import { Converter, type Value } from "@lox-nexus/plugin-sdk/values"
import type { SignalSpec } from "@lox-nexus/plugin-sdk/wire"
import { BoundedIndex } from "../bus/BoundedIndex.ts"
import type { BusMessage, Cause, MessageSource } from "../bus/BusMessage.ts"
import type { EventBus } from "../bus/EventBus.ts"
import type { Signal } from "../wires/Signal.ts"
import type { SignalRegistry } from "../wires/SignalRegistry.ts"
import { PluginTopics } from "./PluginTopics.ts"
import type { PluginInstanceConfig, PluginPackage, PluginSignalConfig, SignalValueType } from "./PluginTypes.ts"
import { DomainError } from "../DomainError.ts"

/** The slice of EventBus the plugin side needs. */
export type PluginBus = Pick<EventBus, "publish" | "subscribe" | "result" | "event" | "replayForce">

/** A configured signal with its topic and, when the plugin refused it, why. */
export interface PluginSignalEntry {
  config: PluginSignalConfig
  topic: string
  valueType: SignalValueType
  error?: string
  /**
   * the plugin's current version no longer offers its capability: the signal keeps its topic, wires
   * and last value but isn't created in the plugin, until a version that offers it again
   */
  orphaned?: boolean
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
    if (this.entries.has(config.id)) throw new DomainError("signal-exists", `signal "${config.id}" already exists`)
    const entry = this.entryFor(config)
    this.registry.register(this.signalOf(entry))
    this.entries.set(config.id, { ...entry, ...this.subscribe(entry) })
    return entry
  }

  /**
   * Registers a stored signal, also one whose capability the current version doesn't offer (after
   * an update and a restart): that one is orphaned, typed "any" until a version offers it again,
   * so its row, topic and wires survive. @throws Error for a duplicate id or a taken topic
   */
  restore(config: PluginSignalConfig) {
    if (this.capability(config)) return this.add(config)
    if (this.entries.has(config.id)) throw new DomainError("signal-exists", `signal "${config.id}" already exists`)
    const entry: PluginSignalEntry = { config, topic: this.topics.forSignal(config), valueType: "any", orphaned: true, error: this.orphanReason(config) }
    this.registry.register(this.signalOf(entry))
    this.entries.set(config.id, { ...entry, ...this.subscribe(entry) })
    return entry
  }

  /** Replaces a signal's config (same id); its wires stay. @throws like add() */
  update(config: PluginSignalConfig) {
    const previous = this.entries.get(config.id)
    if (!previous) throw new DomainError("unknown-signal", `unknown signal "${config.id}"`)
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

  /** a new instance slug moves every topic; wires survive because they refer to ids. Orphans move too and stay orphaned. */
  rename(instance: PluginInstanceConfig) {
    this.instance = instance
    this.topics = new PluginTopics(instance)
    for (const entry of [...this.entries.values()]) {
      if (!entry.orphaned) {
        this.update(entry.config)
        continue
      }
      const moved = { ...entry, topic: this.topics.forSignal(entry.config) }
      this.registry.update(this.signalOf(moved))
      void entry.subscription?.dispose()
      this.entries.set(entry.config.id, { ...moved, ...this.subscribe(moved) })
    }
  }

  /** undefined for unknown ids */
  get(id: string): PluginSignalEntry | undefined {
    return this.list().find(entry => entry.config.id === id)
  }

  /** a snapshot; the entries are copies */
  list(): PluginSignalEntry[] {
    return [...this.entries.values()].map(({ config, topic, valueType, error, orphaned }) => ({ config, topic, valueType, ...(error ? { error } : {}), ...(orphaned ? { orphaned } : {}) }))
  }

  /** what the worker needs to recreate every signal after a (re)start; orphaned ones are left out, the plugin wouldn't know them */
  specs(): Array<SignalSpec & { id: string }> {
    return [...this.entries.values()].filter(entry => !entry.orphaned).map(({ config }) => PluginSignals.spec(config))
  }

  /** what the worker gets to create one signal; the label lets the plugin name it in panels and logs */
  static spec(config: PluginSignalConfig): SignalSpec & { id: string } {
    return { id: config.id, kind: config.kind, capability: config.capability, params: config.params, label: config.label }
  }

  /**
   * Resolves every signal against the current package again, after an update or a rollback.
   * Nothing is deleted: a signal whose capability is gone stays registered (topic, wires, last
   * value) and is marked orphaned with the reason; one whose capability is back is cleared; a
   * changed value type goes through the registry, so the wire engine rebuilds or drops its wires.
   */
  refresh() {
    for (const entry of this.entries.values()) {
      const capability = this.capability(entry.config)
      if (!capability) {
        entry.orphaned = true
        entry.error = this.orphanReason(entry.config)
        continue
      }
      if (entry.orphaned) {
        delete entry.orphaned
        delete entry.error
      }
      if (capability.valueType === entry.valueType) continue
      entry.valueType = capability.valueType
      this.registry.update(this.signalOf(entry))
    }
  }

  /** remembers why the plugin was told to act, so what it emits meanwhile continues that trace */
  rememberCause(message: BusMessage) {
    this.causes.set(message.id, message)
  }

  /**
   * a sensor's value from the plugin, converted to the type the sensor declares (so wires and the
   * Miniserver can rely on it); values for unknown ids or actuators are dropped. A value clears
   * the error the sensor reported earlier.
   */
  publish(signalId: string, value: Value, causeId: string | undefined) {
    const entry = this.entries.get(signalId)
    if (entry?.config.kind !== "sensor") return
    // a sensor that reported a failure and sends values again works again
    delete entry.error
    const cause = causeId === undefined ? undefined : this.causes.get(causeId)
    const typed = entry.valueType === "any" ? value : Converter.convert(value, entry.valueType)
    this.bus.publish(entry.topic, typed, { source: this.source, ...(cause ? { cause } : {}) })
  }

  /** marks a signal as refused (or working again with undefined) */
  setError(signalId: string, error: string | undefined) {
    const entry = this.entries.get(signalId)
    if (!entry) return
    if (error === undefined) delete entry.error
    else entry.error = error
  }

  /** attributes bus messages to the instance, for the inspector */
  get source(): MessageSource {
    return { kind: "plugin", id: this.instance.id, label: this.instance.label }
  }

  private entryFor(config: PluginSignalConfig): PluginSignalEntry {
    const capability = this.capability(config)
    if (!capability) throw new DomainError("unknown-capability", `${this.pkg().name} has no ${config.kind} "${config.capability}"`)
    return { config, topic: this.topics.forSignal(config), valueType: capability.valueType }
  }

  private orphanReason(config: PluginSignalConfig) {
    const { name, version } = this.pkg()
    return `${name}${version ? ` ${version}` : ""} no longer offers ${config.kind} "${config.capability}"`
  }

  private capability(config: PluginSignalConfig) {
    const { description } = this.pkg()
    const offered = config.kind === "sensor" ? description.sensors : description.actuators
    return offered.find(candidate => candidate.id === config.capability)
  }

  private signalOf(entry: PluginSignalEntry): Signal {
    const sensor = entry.config.kind === "sensor"
    return {
      id: entry.config.id, topic: entry.topic, label: entry.config.label, valueType: entry.valueType,
      direction: sensor ? "source" : "target", delivery: sensor ? "state" : "command",
      owner: { kind: "plugin", id: this.instance.id }
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
