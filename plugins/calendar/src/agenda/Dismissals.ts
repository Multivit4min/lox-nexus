import { z, type PluginStore } from "@lox-nexus/plugin-sdk"
import type { Occurrence } from "../ics/Occurrence.ts"

// occurrence key → when the dismissal may be forgotten (ms since epoch)
const storedSchema = z.record(z.string(), z.number())

/**
 * Occurrences dismissed by a `dismiss` actuator or the panel, persisted so a restart doesn't bring them back.
 * Keyed per occurrence (UID plus start), so dismissing one occurrence of a series leaves the
 * others. Each entry is forgotten once its occurrence is over, so the store doesn't grow (the old
 * integration kept every dismissed UID forever).
 */
export class Dismissals {
  static readonly STORE_KEY = "dismissed"
  private readonly entries: Map<string, number>

  constructor(private readonly store: PluginStore) {
    // whatever an older version or a broken write left is dropped rather than trusted
    const stored = storedSchema.safeParse(store.get(Dismissals.STORE_KEY) ?? {})
    this.entries = new Map(Object.entries(stored.success ? stored.data : {}))
  }

  get size() {
    return this.entries.size
  }

  has(occurrence: Occurrence) {
    return this.entries.has(occurrence.key)
  }

  /**
   * @param keepUntil when each dismissal may be forgotten
   * @returns whether anything was added
   */
  add(occurrences: Occurrence[], keepUntil: (occurrence: Occurrence) => number) {
    const fresh = occurrences.filter(occurrence => !this.entries.has(occurrence.key))
    for (const occurrence of fresh) this.entries.set(occurrence.key, keepUntil(occurrence))
    if (fresh.length > 0) this.save()
    return fresh.length > 0
  }

  /** brings a dismissed occurrence back; @returns whether it was dismissed */
  remove(key: string) {
    if (!this.entries.delete(key)) return false
    this.save()
    return true
  }

  /** forgets dismissals whose occurrence is over */
  prune(now: number) {
    const expired = [...this.entries].filter(([, until]) => until <= now)
    for (const [key] of expired) this.entries.delete(key)
    if (expired.length > 0) this.save()
  }

  private save() {
    if (this.entries.size === 0) this.store.delete(Dismissals.STORE_KEY)
    else this.store.set(Dismissals.STORE_KEY, Object.fromEntries(this.entries))
  }
}
