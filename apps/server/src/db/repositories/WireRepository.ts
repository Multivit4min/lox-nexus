import type { WireInput } from "@lox-nexus/core"
import type { Database } from "../Database.ts"

interface WireRow {
  id: string
  label: string
  source_id: string
  target_id: string
  transforms: string
  enabled: number
  sync_on_start: number
}

/** Wires as stored. Rows come back as WireInput because WireEngine validates them (transforms are JSON). */
export class WireRepository {
  constructor(private readonly db: Database) {}

  list(): WireInput[] {
    return this.db.all<WireRow>("SELECT * FROM wires ORDER BY label, id").map(WireRepository.toInput)
  }

  get(id: string): WireInput | undefined {
    const row = this.db.get<WireRow>("SELECT * FROM wires WHERE id = :id", { id })
    return row && WireRepository.toInput(row)
  }

  /** inserts or replaces by id */
  save(wire: Required<WireInput>) {
    this.db.run(
      `INSERT INTO wires (id, label, source_id, target_id, transforms, enabled, sync_on_start)
       VALUES (:id, :label, :sourceId, :targetId, :transforms, :enabled, :syncOnStart)
       ON CONFLICT (id) DO UPDATE SET label = excluded.label, source_id = excluded.source_id, target_id = excluded.target_id,
         transforms = excluded.transforms, enabled = excluded.enabled, sync_on_start = excluded.sync_on_start`,
      {
        id: wire.id, label: wire.label, sourceId: wire.sourceId, targetId: wire.targetId,
        transforms: JSON.stringify(wire.transforms), enabled: wire.enabled ? 1 : 0, syncOnStart: wire.syncOnStart ? 1 : 0
      }
    )
  }

  delete(id: string) {
    this.db.run("DELETE FROM wires WHERE id = :id", { id })
  }

  private static toInput(row: WireRow): WireInput {
    return {
      id: row.id, label: row.label, sourceId: row.source_id, targetId: row.target_id,
      transforms: WireRepository.parseTransforms(row.transforms), enabled: row.enabled === 1, syncOnStart: row.sync_on_start === 1
    }
  }

  // unreadable JSON becomes an invalid value on purpose, so WireEngine rejects the wire with a reason
  private static parseTransforms(text: string): WireInput["transforms"] {
    try {
      return JSON.parse(text) as WireInput["transforms"]
    } catch {
      return [{ op: "invalid" }] as unknown as WireInput["transforms"]
    }
  }
}
