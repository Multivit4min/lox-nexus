import type { LoadHistoryStore, LoadSample } from "@lox-nexus/loxone"
import type { Database } from "../Database.ts"

interface LoadSampleRow {
  ts: number
  incoming: number
  outgoing: number
  percent: number
}

/**
 * Keeps each Miniserver's last hour of load samples, so the history survives a restart. One row
 * every 5 s per Miniserver; older rows are deleted as new ones arrive. Rows go with their
 * Miniserver (ON DELETE CASCADE).
 */
export class LoadSampleRepository implements LoadHistoryStore {
  /** @param warn told about failed writes; append() runs in a timer and must not throw */
  constructor(private readonly db: Database, private readonly warn: (message: string) => void = () => {}) {}

  load(miniserverId: string, since: number): LoadSample[] {
    return this.db.all<LoadSampleRow>(
      "SELECT ts, incoming, outgoing, percent FROM load_samples WHERE miniserver_id = :id AND ts > :since ORDER BY ts",
      { id: miniserverId, since }
    ).map(row => ({ ts: row.ts, incomingPerSecond: row.incoming, outgoingPerSecond: row.outgoing, percent: row.percent }))
  }

  append(miniserverId: string, sample: LoadSample, keepSince: number) {
    try {
      this.db.transaction(() => {
        this.db.run(
          "INSERT OR REPLACE INTO load_samples (miniserver_id, ts, incoming, outgoing, percent) VALUES (:id, :ts, :incoming, :outgoing, :percent)",
          { id: miniserverId, ts: sample.ts, incoming: sample.incomingPerSecond, outgoing: sample.outgoingPerSecond, percent: sample.percent }
        )
        this.db.run("DELETE FROM load_samples WHERE miniserver_id = :id AND ts <= :keepSince", { id: miniserverId, keepSince })
      })
    } catch (error) {
      // a Miniserver deleted a moment ago (foreign key) or a busy database: lose one sample, not the process
      this.warn(`storing a load sample of ${miniserverId} failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
