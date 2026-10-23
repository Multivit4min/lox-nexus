import type { LoxoneSignalConfig } from "@lox-nexus/loxone"
import type { Database } from "../Database.ts"

interface LoxoneSignalRow {
  id: string
  miniserver_id: string
  packet_id: string
  direction: "in" | "out"
  data_type: number
  label: string
  slug: string | null
}

/** A stored Loxone signal: its config plus the Miniserver it belongs to. dataType is validated when the Miniserver parses it. */
export type StoredLoxoneSignal = Omit<LoxoneSignalConfig, "dataType"> & { dataType: number; miniserverId: string }

/** Loxone signals, with a row in the `signals` supertable so wires can reference them. */
export class LoxoneSignalRepository {
  static readonly OWNER = "loxone"

  constructor(private readonly db: Database) {}

  listFor(miniserverId: string): StoredLoxoneSignal[] {
    return this.db.all<LoxoneSignalRow>("SELECT * FROM loxone_signals WHERE miniserver_id = :miniserverId ORDER BY label, id", { miniserverId })
      .map(LoxoneSignalRepository.toSignal)
  }

  get(id: string): StoredLoxoneSignal | undefined {
    const row = this.db.get<LoxoneSignalRow>("SELECT * FROM loxone_signals WHERE id = :id", { id })
    return row && LoxoneSignalRepository.toSignal(row)
  }

  insert(signal: StoredLoxoneSignal) {
    this.db.transaction(() => {
      this.db.run("INSERT INTO signals (id, owner) VALUES (:id, :owner)", { id: signal.id, owner: LoxoneSignalRepository.OWNER })
      this.db.run(
        `INSERT INTO loxone_signals (id, miniserver_id, packet_id, direction, data_type, label, slug)
         VALUES (:id, :miniserverId, :packetId, :direction, :dataType, :label, :slug)`,
        {
          id: signal.id, miniserverId: signal.miniserverId, packetId: signal.packetId, direction: signal.direction,
          dataType: signal.dataType, label: signal.label, slug: signal.slug ?? null
        }
      )
    })
  }

  /** deleting the supertable row cascades to loxone_signals and to the signal's wires */
  delete(id: string) {
    this.db.run("DELETE FROM signals WHERE id = :id", { id })
  }

  private static toSignal(row: LoxoneSignalRow): StoredLoxoneSignal {
    return {
      id: row.id, miniserverId: row.miniserver_id, packetId: row.packet_id, direction: row.direction,
      dataType: row.data_type, label: row.label, ...(row.slug === null ? {} : { slug: row.slug })
    }
  }
}
