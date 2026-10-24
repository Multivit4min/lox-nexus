import type { PluginSignalDto } from "@lox-nexus/api"
import type { CatalogEntry, CatalogNode } from "@lox-nexus/plugin-sdk/wire"

/** One addable entry of a plugin's catalog with where it sits ("Kitchen ▸ Light"). */
export interface CatalogRow {
  key: string
  path: string
  entry: CatalogEntry
}

/** Flattens a plugin's catalog tree into searchable rows and tells which entries are configured already. */
export class CatalogTree {
  static rows(nodes: CatalogNode[], parents: string[] = []): CatalogRow[] {
    return nodes.flatMap(node => {
      const path = [...parents, node.label]
      const own = (node.entries ?? []).map((entry, i) => ({ key: `${path.join("\u0000")}\u0000${i}`, path: path.join(" ▸ "), entry }))
      return [...own, ...CatalogTree.rows(node.children ?? [], path)]
    })
  }

  /** an entry is configured when a signal has its kind, capability and params (key order doesn't matter) */
  static configured(entry: CatalogEntry, signals: PluginSignalDto[]) {
    const wanted = CatalogTree.canonical(entry.params ?? {})
    return signals.some(s => s.kind === entry.kind && s.capability === entry.capability && CatalogTree.canonical(s.params ?? {}) === wanted)
  }

  private static canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(item => CatalogTree.canonical(item)).join(",")}]`
    if (value && typeof value === "object") {
      const entries = Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b))
      return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${CatalogTree.canonical(v)}`).join(",")}}`
    }
    return JSON.stringify(value)
  }
}
