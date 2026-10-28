import type { PluginPackage } from "@lox-nexus/core"

/** A plugin that can be instantiated, with what the API shows about it. */
export interface CatalogEntry {
  pkg: PluginPackage
  /** from the plugin's package.json */
  version: string
  /** from the manifest; how the UI interprets it is up to the UI */
  icon?: string
  /** development: the workspace's plugins/ from source (DevPluginLoader); installed: through the installer */
  source: "development" | "installed"
}

/**
 * The plugins available to create instances from, by id, in two layers. A development copy wins
 * over an installed plugin with the same id (ADR 0010): whoever sets NEXUS_DEV_PLUGINS_DIR wants
 * to run their source.
 */
export class PluginCatalog {
  private readonly developmentEntries = new Map<string, CatalogEntry>()
  private readonly installedEntries = new Map<string, CatalogEntry>()

  /** adds or replaces by plugin id; a reload replaces the old package */
  setDevelopment(entry: Omit<CatalogEntry, "source">) {
    this.developmentEntries.set(entry.pkg.id, { ...entry, source: "development" })
  }

  /** the active installed version of a plugin */
  setInstalled(entry: Omit<CatalogEntry, "source">) {
    this.installedEntries.set(entry.pkg.id, { ...entry, source: "installed" })
  }

  removeInstalled(id: string) {
    this.installedEntries.delete(id)
  }

  /** the entry instances run: the development copy if there is one; undefined when no loader provided it */
  get(id: string) {
    return this.developmentEntries.get(id) ?? this.installedEntries.get(id)
  }

  /** the installed layer only, also when a development copy hides it */
  installed(id: string) {
    return this.installedEntries.get(id)
  }

  /** whether a development copy hides the installed plugin */
  shadowed(id: string) {
    return this.developmentEntries.has(id) && this.installedEntries.has(id)
  }

  /** the effective entries, sorted by name for stable UI order */
  list() {
    const ids = new Set([...this.developmentEntries.keys(), ...this.installedEntries.keys()])
    return [...ids].map(id => this.get(id)!).sort((a, b) => a.pkg.name.localeCompare(b.pkg.name))
  }
}
