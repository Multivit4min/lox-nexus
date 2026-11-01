import { z, type PluginStore } from "@lox-nexus/plugin-sdk"

/** What is known of a schedule across restarts. All times are epoch ms. */
export interface RunRecord {
  /** when its sensor last started */
  seen: number
  /** when it last ran (a window: last switched on) */
  ran?: number
  /** runs up to here were dealt with: run, skipped, switched off, missed, or passed while it ran */
  handled?: number
  /** a window opened by Run now stays open until then */
  openUntil?: number
}

const recordSchema = z.object({ seen: z.number(), ran: z.number().optional(), handled: z.number().optional(), openUntil: z.number().optional() })

/**
 * What each schedule (by key) did, persisted under one store key per schedule, so a run writes a
 * few bytes rather than every schedule's record. The grace for runs missed while Nexus was down
 * needs it: it applies only to a schedule that existed before, and never to a run already dealt
 * with (run, skipped, switched off, or passed while the schedule was running before a restart or
 * an edit). Records of schedules not active for KEEP_MS are dropped at start, which also clears
 * schedules that were removed.
 */
export class RunLog {
  static readonly PREFIX = "run:"
  static readonly KEEP_MS = 400 * 86_400_000
  private readonly records = new Map<string, RunRecord>()

  constructor(private readonly store: PluginStore, now: number) {
    for (const storeKey of store.keys().filter(key => key.startsWith(RunLog.PREFIX))) {
      const record = recordSchema.safeParse(store.get(storeKey))
      const latest = record.success ? Math.max(record.data.seen, record.data.ran ?? 0, record.data.handled ?? 0) : 0
      // whatever an older version or a broken write left is dropped rather than trusted
      if (record.success && latest > now - RunLog.KEEP_MS) this.records.set(storeKey.slice(RunLog.PREFIX.length), record.data)
      else store.delete(storeKey)
    }
  }

  get(key: string): RunRecord | undefined {
    return this.records.get(key)
  }

  /** a schedule's sensor started; @returns what was known before */
  started(key: string, now: number): RunRecord | undefined {
    const before = this.records.get(key)
    this.save(key, { ...before, seen: now })
    return before
  }

  ran(key: string, at: number) {
    this.update(key, { ran: at, handled: at })
  }

  /** runs up to `at` are dealt with; the caller keeps it moving forward (except after a clock step back) */
  handled(key: string, at: number) {
    if (this.records.get(key)?.handled !== at) this.update(key, { handled: at })
  }

  /** a window opened by Run now until `until`, or no longer (undefined) */
  opened(key: string, until: number | undefined) {
    const record: RunRecord = { ...(this.records.get(key) ?? { seen: 0 }) }
    if (until === undefined) delete record.openUntil
    else record.openUntil = until
    this.save(key, record)
  }

  private update(key: string, patch: Partial<RunRecord>) {
    const before = this.records.get(key)
    this.save(key, { seen: before?.seen ?? patch.ran ?? patch.handled ?? 0, ...before, ...patch })
  }

  private save(key: string, record: RunRecord) {
    this.records.set(key, record)
    this.store.set(`${RunLog.PREFIX}${key}`, record)
  }
}
