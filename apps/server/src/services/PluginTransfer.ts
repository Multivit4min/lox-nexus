import type { ExportedPluginSchema } from "@lox-nexus/api"
import { SignalDisplays, type PluginInstanceConfig, type PluginStateStore } from "@lox-nexus/core"
import type { JsonSchema } from "@lox-nexus/plugin-sdk/wire"
import type { z } from "zod"
import type { Persistence } from "../db/Persistence.ts"
import type { PluginInstanceRepository } from "../db/repositories/PluginInstanceRepository.ts"
import type { PluginSignalRepository } from "../db/repositories/PluginSignalRepository.ts"
import type { PluginCatalog } from "../plugins/PluginCatalog.ts"
import type { PluginService } from "./PluginService.ts"
import type { SelectionService } from "./SelectionService.ts"

type ExportedPlugin = z.output<typeof ExportedPluginSchema>
type Step = (where: string, work: () => unknown) => Promise<boolean>
/** per instance id: its secret settings, or its store */
export type ByInstance = Record<string, Record<string, unknown>>

/** The instances as they are before an import: what an imported instance of the same id and plugin keeps. */
export interface PluginSnapshot {
  secrets: ByInstance
  stores: ByInstance
  /** the plugin of each instance, so another plugin's instance under the same id inherits nothing */
  plugins: Record<string, string>
}

/** What moving plugin instances needs; built by NexusApp. */
export interface PluginTransferDeps {
  repo: Pick<PluginInstanceRepository, "list" | "save">
  signals: Pick<PluginSignalRepository, "listFor" | "insert">
  store: Pick<PluginStateStore, "load" | "set">
  plugins: Pick<PluginService, "remove" | "packageChanged" | "secrets" | "stop" | "watches">
  catalog: Pick<PluginCatalog, "get">
  selections?: Pick<SelectionService, "of" | "setMode" | "setRules">
}

/**
 * The plugin instances of a config export: settings without secrets (those apart, for sealing),
 * signals and watched signals. An import writes them as stored rows, as the boot loads them, so
 * settings aren't checked (an instance without its secrets says so when it starts) and an
 * instance of a plugin that isn't installed is kept as unavailable. Stores aren't exported; an
 * instance with the same id and plugin keeps its store and secrets over an import.
 */
export class PluginTransfer {
  constructor(private readonly deps: PluginTransferDeps) {}

  /** from the app's repositories and services */
  static of(db: Pick<Persistence, "pluginInstances" | "pluginSignals" | "pluginStore">, plugins: PluginTransferDeps["plugins"], rest: Pick<PluginTransferDeps, "catalog" | "selections">) {
    return new PluginTransfer({ repo: db.pluginInstances, signals: db.pluginSignals, store: db.pluginStore, plugins, ...rest })
  }

  export(): { plugins: ExportedPlugin[]; secrets: ByInstance } {
    const secrets: ByInstance = {}
    const plugins = this.deps.repo.list().map((instance): ExportedPlugin => {
      const { visible, secret } = this.split(instance)
      if (Object.keys(secret).length > 0) secrets[instance.id] = secret
      const watch = this.deps.plugins.watches(instance.id) ? this.deps.selections?.of(instance.id) : undefined
      return {
        id: instance.id, plugin: instance.plugin, slug: instance.slug, label: instance.label, enabled: instance.enabled, config: visible,
        ...(instance.configVersion === undefined ? {} : { configVersion: instance.configVersion }),
        signals: this.deps.signals.listFor(instance.id).map(({ id, kind, capability, params, label, slug, ...display }) => ({
          id, kind, capability, params, label, slug, ...SignalDisplays.of(display)
        })),
        ...(watch ? { watch: { mode: watch.mode, rules: watch.rules.map(({ target, include }) => ({ target: { ...target }, include })) } } : {})
      }
    })
    return { plugins, secrets }
  }

  /** the ids of every plugin signal now: wire ends a file without plugin instances may use */
  signalIds() {
    return new Set(this.deps.repo.list().flatMap(({ id }) => this.deps.signals.listFor(id).map(signal => signal.id)))
  }

  /** stops the running instances, so the stores have what they wrote last, and keeps their secrets and stores */
  async snapshot(): Promise<PluginSnapshot> {
    const snapshot: PluginSnapshot = { secrets: this.export().secrets, stores: {}, plugins: {} }
    for (const { id, plugin } of this.deps.repo.list()) {
      // an unavailable instance has nothing running
      await this.deps.plugins.stop(id).catch(() => undefined)
      snapshot.stores[id] = this.deps.store.load(id)
      snapshot.plugins[id] = plugin
    }
    return snapshot
  }

  /** removes every instance with its signals, wires, store and selection */
  async clear(by: string) {
    for (const { id } of this.deps.repo.list()) await this.deps.plugins.remove(id, by)
  }

  /**
   * Writes the instances with their signals and secrets: what the instance of the same id and
   * plugin had, under the file's settings and secrets. Its store comes back too. Then it attaches
   * them, and with `start` starts the enabled ones whose plugin is installed.
   * @returns the counts, and the instances lacking a required secret
   */
  async apply(plugins: readonly ExportedPlugin[], current: PluginSnapshot, fileSecrets: ByInstance, step: Step, start: boolean) {
    const counts = { plugins: 0, pluginSignals: 0 }
    for (const [i, { signals, id, plugin: type, slug, label, enabled, config: settings, configVersion }] of plugins.entries()) {
      const plugin = { id, plugin: type, slug, label, enabled, ...(configVersion === undefined ? {} : { configVersion }) }
      const same = current.plugins[id] === type
      const config = { ...(same ? current.secrets[id] : {}), ...settings, ...fileSecrets[id] }
      if (!await step(`plugins[${i}]`, () => this.deps.repo.save({ ...plugin, config }))) continue
      counts.plugins++
      if (same) for (const [key, value] of Object.entries(current.stores[plugin.id] ?? {})) this.deps.store.set(plugin.id, key, value)
      for (const [j, signal] of signals.entries()) {
        if (await step(`plugins[${i}].signals[${j}]`, () => this.deps.signals.insert(plugin.id, signal))) counts.pluginSignals++
      }
    }
    for (const id of new Set(plugins.map(plugin => plugin.plugin))) {
      const entry = this.deps.catalog.get(id)
      if (entry) await step(`plugin "${id}"`, () => this.deps.plugins.packageChanged(entry.pkg, start))
    }
    return { ...counts, missingSecrets: this.missing(plugins, current, fileSecrets) }
  }

  /** the watched signals, once every signal of the file exists; one rule at a time while restoring */
  async applyWatches(plugins: readonly ExportedPlugin[], step: Step, oneByOne: boolean) {
    const selections = this.deps.selections
    if (!selections) return
    for (const [i, { id, watch }] of plugins.entries()) {
      if (!watch) continue
      await step(`plugins[${i}].watch`, () => selections.setMode(id, watch.mode))
      const batches = oneByOne ? watch.rules.map(rule => [rule]) : [watch.rules]
      for (const batch of batches) if (batch.length > 0) await step(`plugins[${i}].watch`, () => selections.setRules(id, batch))
    }
  }

  // Fails closed: a plugin that isn't installed can't say which fields are secret, nor can a
  // schema without top-level fields (a union) or with secrets below them. Then all count as secret.
  private split(instance: PluginInstanceConfig) {
    const config = instance.config && typeof instance.config === "object" ? instance.config as Record<string, unknown> : {}
    const schema = this.deps.catalog.get(instance.plugin)?.pkg.description.config
    if (!schema || !PluginTransfer.secretsKnown(schema)) return { visible: {}, secret: config }
    const visible = this.deps.plugins.secrets(instance.plugin).strip(config)
    return { visible, secret: Object.fromEntries(Object.entries(config).filter(([key]) => !(key in visible))) }
  }

  private static secretsKnown(schema: JsonSchema) {
    const properties = schema.properties as Record<string, object> | undefined
    if (!properties) return false
    const marked = (value: unknown) => (JSON.stringify(value).match(/"writeOnly":true/g) ?? []).length
    const topLevel = Object.values(properties).filter(field => (field as { writeOnly?: boolean }).writeOnly === true).length
    return marked(schema) === topLevel
  }

  // only required ones: an optional secret (a password for a feed that needs none) may well be unset
  private missing(plugins: readonly ExportedPlugin[], current: PluginSnapshot, fileSecrets: ByInstance) {
    return plugins.flatMap(plugin => {
      const entry = this.deps.catalog.get(plugin.plugin)
      if (!entry) return []
      const required = entry.pkg.description.config.required
      const needed = new Set(Array.isArray(required) ? required.filter(name => typeof name === "string") : [])
      const have = { ...(current.plugins[plugin.id] === plugin.plugin ? current.secrets[plugin.id] : {}), ...plugin.config, ...fileSecrets[plugin.id] }
      const fields = this.deps.plugins.secrets(plugin.plugin).secretNames.filter(name => needed.has(name) && have[name] === undefined)
      return fields.length > 0 ? [{ id: plugin.id, label: plugin.label || plugin.slug, fields }] : []
    })
  }
}
