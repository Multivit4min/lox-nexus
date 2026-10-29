import { z, type PluginLogger, type PluginStore } from "@lox-nexus/plugin-sdk"

/** the retained topics one exported signal uses: its state, and its discovery config */
export interface Announced {
  state: string
  config?: string | undefined
}

const stored = z.object({
  signals: z.record(z.string(), z.object({ state: z.string(), config: z.string().optional() })),
  clears: z.array(z.string())
})

/**
 * Remembers in the plugin store which retained topics the export uses, so the ones of a signal
 * that is no longer exported (left out, renamed, moved by a new base topic, or discovery turned
 * off) are removed, even across restarts. Removals not done yet are stored too.
 */
export class ExportRegistry {
  static readonly KEY = "export"
  private announced = new Map<string, Announced>()
  private readonly pending = new Set<string>()

  constructor(private readonly store: PluginStore, private readonly log: PluginLogger) {
    const parsed = stored.safeParse(store.get(ExportRegistry.KEY))
    if (!parsed.success) return
    this.announced = new Map(Object.entries(parsed.data.signals))
    for (const topic of parsed.data.clears) this.pending.add(topic)
  }

  /** retained topics waiting to be removed */
  get clears() {
    return [...this.pending]
  }

  /** records what the signals use now; topics no longer used wait to be removed */
  update(signals: Map<string, Announced>) {
    const used = new Set<string>()
    for (const { state, config } of signals.values()) {
      used.add(state)
      if (config) used.add(config)
    }
    for (const { state, config } of this.announced.values()) {
      for (const topic of [state, config]) if (topic && !used.has(topic)) this.pending.add(topic)
    }
    for (const topic of used) this.pending.delete(topic)
    const before = JSON.stringify([...this.announced])
    this.announced = new Map(signals)
    // Nexus sends the list again on many changes elsewhere; the store is written only when ours changed
    if (JSON.stringify([...this.announced]) !== before || this.pending.size > 0) this.save()
  }

  cleared(topics: string[]) {
    if (topics.length === 0) return
    for (const topic of topics) this.pending.delete(topic)
    this.save()
  }

  private save() {
    try {
      this.store.set(ExportRegistry.KEY, { signals: Object.fromEntries(this.announced), clears: [...this.pending] })
    } catch (error) {
      // over the store's 1 MiB: removals after a restart may be missed, the export itself goes on
      this.log.warn("can't remember the exported topics", { error: error instanceof Error ? error.message : String(error) })
    }
  }
}
