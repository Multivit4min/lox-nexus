import type { PluginPackage } from "@lox-nexus/core"

/** A plugin that can be instantiated, with what the API shows about it. */
export interface CatalogEntry {
  pkg: PluginPackage
  /** from the plugin's package.json */
  version: string
  /** from the manifest; how the UI interprets it is up to the UI */
  icon?: string
  /** where the plugin came from; only workspace plugins (DevPluginLoader) exist so far */
  source: "development"
}

/** The plugins available to create instances from, by id. Filled by the loaders. */
export class PluginCatalog {
  private readonly entries = new Map<string, CatalogEntry>()

  /** adds or replaces by plugin id; a reload replaces the old package */
  set(entry: CatalogEntry) {
    this.entries.set(entry.pkg.id, entry)
  }

  /** undefined when no loader provided that plugin */
  get(id: string) {
    return this.entries.get(id)
  }

  /** sorted by name, for stable UI order */
  list() {
    return [...this.entries.values()].sort((a, b) => a.pkg.name.localeCompare(b.pkg.name))
  }
}
