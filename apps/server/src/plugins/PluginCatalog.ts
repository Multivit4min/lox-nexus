import type { PluginPackage } from "@lox-nexus/core"

/** A plugin that can be instantiated, with what the API shows about it. */
export interface CatalogEntry {
  pkg: PluginPackage
  version: string
  icon?: string
  source: "development"
}

/** The plugins available to create instances from, by id. Filled by the loaders. */
export class PluginCatalog {
  private readonly entries = new Map<string, CatalogEntry>()

  set(entry: CatalogEntry) {
    this.entries.set(entry.pkg.id, entry)
  }

  get(id: string) {
    return this.entries.get(id)
  }

  list() {
    return [...this.entries.values()].sort((a, b) => a.pkg.name.localeCompare(b.pkg.name))
  }
}
