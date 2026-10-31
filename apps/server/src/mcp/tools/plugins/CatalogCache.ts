import type { CatalogNode } from "@lox-nexus/plugin-sdk/wire"

/**
 * A plugin's catalog for a minute: an agent pages through it and searches it several times in a
 * row, and asking a plugin for its catalog can take seconds (Home Assistant lists every entity).
 */
export class CatalogCache {
  static readonly TTL_MS = 60_000
  private readonly entries = new Map<string, { at: number; nodes: Promise<CatalogNode[]> }>()

  constructor(private readonly plugins: { catalog(instanceId: string): Promise<CatalogNode[]> | CatalogNode[] }, private readonly now: () => number) {}

  get(instanceId: string): Promise<CatalogNode[]> {
    const now = this.now()
    for (const [id, entry] of this.entries) if (now - entry.at >= CatalogCache.TTL_MS) this.entries.delete(id)
    const cached = this.entries.get(instanceId)
    if (cached) return cached.nodes
    const nodes = Promise.resolve().then(() => this.plugins.catalog(instanceId))
    this.entries.set(instanceId, { at: now, nodes })
    // a failure is answered once, not for a minute
    nodes.catch(() => this.entries.delete(instanceId))
    return nodes
  }
}
