import type { SnapshotEntry } from "@lox-nexus/core"
import type { Database } from "../Database.ts"
import { ValueJson } from "../ValueJson.ts"

/** The last real value per topic, written in batches by SnapshotWriter and replayed at boot. */
export class SnapshotRepository {
  constructor(private readonly db: Database) {}

  /** rows with unreadable values are left out */
  load(): SnapshotEntry[] {
    return this.db.all<{ topic: string; value: string; ts: number }>("SELECT topic, value, ts FROM value_snapshot ORDER BY ts")
      .flatMap(row => {
        const value = ValueJson.parse(row.value)
        return value ? [{ topic: row.topic, value, ts: row.ts }] : []
      })
  }

  /** upserts all entries atomically: either the whole batch is stored or none of it */
  save(entries: SnapshotEntry[]) {
    if (entries.length === 0) return
    this.db.transaction(() => {
      for (const entry of entries) {
        this.db.run(
          `INSERT INTO value_snapshot (topic, value, ts) VALUES (:topic, :value, :ts)
           ON CONFLICT (topic) DO UPDATE SET value = excluded.value, ts = excluded.ts`,
          { topic: entry.topic, value: ValueJson.stringify(entry.value), ts: entry.ts }
        )
      }
    })
  }

  /** drops values of topics that no longer exist, e.g. after a signal was deleted */
  delete(topic: string) {
    this.db.run("DELETE FROM value_snapshot WHERE topic = :topic", { topic })
  }
}
