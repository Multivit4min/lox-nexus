import type { ForceRecord, ForceStore } from "@lox-nexus/core"
import type { Database } from "../Database.ts"
import { ValueJson } from "../ValueJson.ts"

/** A row of the `forces` table; `until` and `at` are epoch ms, nullable columns map to optional fields. */
interface ForceRow {
  topic: string
  value: string
  forced_by: string
  reason: string | null
  until: number | null
  at: number
  kind: "state" | "command"
}

/** The database-backed ForceStore: forces survive restarts. */
export class ForceRepository implements ForceStore {
  /** @param warn told about rows that can't be read back; they are skipped, not deleted, so nothing is lost silently */
  constructor(private readonly db: Database, private readonly warn: (message: string) => void = () => {}) {}

  /** all stored forces, read once at boot by EventBus.restoreForces() */
  load(): ForceRecord[] {
    return this.db.all<ForceRow>("SELECT * FROM forces").flatMap(row => {
      const value = ValueJson.parse(row.value)
      if (!value) {
        this.warn(`ignoring force on ${row.topic}: stored value is invalid`)
        return []
      }
      return [{
        topic: row.topic, value, by: row.forced_by, at: row.at, kind: row.kind,
        ...(row.reason === null ? {} : { reason: row.reason }),
        ...(row.until === null ? {} : { until: row.until })
      }]
    })
  }

  /** inserts or replaces: a topic has at most one force */
  save(record: ForceRecord) {
    this.db.run(
      `INSERT INTO forces (topic, value, forced_by, reason, until, at, kind)
       VALUES (:topic, :value, :by, :reason, :until, :at, :kind)
       ON CONFLICT (topic) DO UPDATE SET value = excluded.value, forced_by = excluded.forced_by,
         reason = excluded.reason, until = excluded.until, at = excluded.at, kind = excluded.kind`,
      {
        topic: record.topic, value: ValueJson.stringify(record.value), by: record.by,
        reason: record.reason ?? null, until: record.until ?? null, at: record.at, kind: record.kind
      }
    )
  }

  /** called when a force is released or expires */
  delete(topic: string) {
    this.db.run("DELETE FROM forces WHERE topic = :topic", { topic })
  }
}
