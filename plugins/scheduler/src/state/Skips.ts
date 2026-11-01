import { z, type PluginStore } from "@lox-nexus/plugin-sdk"

/** A skipped occurrence: its scheduled instant, and until when the skip must be kept. */
export interface Skip {
  raw: number
  until: number
}

const storedSchema = z.record(z.string(), z.object({ raw: z.number(), until: z.number() }))

/**
 * The occurrences Skip next marked, one per schedule (by its key). Persisted, so a restart doesn't
 * run a skipped occurrence. An entry is kept past the occurrence (for a run, as long as a restart
 * could still run it late; for a window, until it closes) and forgotten after.
 */
export class Skips {
  static readonly STORE_KEY = "skips"
  private readonly entries: Map<string, Skip>

  constructor(private readonly store: PluginStore, private readonly changed: () => void) {
    const stored = storedSchema.safeParse(store.get(Skips.STORE_KEY) ?? {})
    this.entries = new Map(Object.entries(stored.success ? stored.data : {}))
  }

  get(key: string): Skip | undefined {
    return this.entries.get(key)
  }

  /** whether the occurrence at `raw` of the schedule is skipped */
  skips(key: string, raw: number) {
    return this.entries.get(key)?.raw === raw
  }

  /** @returns whether it changed */
  add(key: string, skip: Skip) {
    if (this.skips(key, skip.raw)) return false
    this.entries.set(key, skip)
    this.save()
    return true
  }

  /** @returns whether there was one */
  remove(key: string) {
    if (!this.entries.delete(key)) return false
    this.save()
    return true
  }

  /** forgets skips whose time is over; tells nobody, since nothing that matters changed */
  prune(now: number) {
    const expired = [...this.entries].filter(([, skip]) => skip.until < now)
    for (const [key] of expired) this.entries.delete(key)
    if (expired.length > 0) this.save(false)
  }

  private save(tell = true) {
    if (this.entries.size === 0) this.store.delete(Skips.STORE_KEY)
    else this.store.set(Skips.STORE_KEY, Object.fromEntries(this.entries))
    if (tell) this.changed()
  }
}
