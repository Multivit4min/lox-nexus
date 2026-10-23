import type { LoxoneSignalConfig } from "@lox-nexus/loxone"
import type { Database } from "../Database.ts"

/** A row of `loxone_signals`; data_type is the ICI data type byte. */
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
  /** value of `signals.owner` for rows written here */
  static readonly OWNER = "loxone"

  constructor(private readonly db: Database) {}

  /** ordered by label for a stable UI */
  listFor(miniserverId: string): StoredLoxoneSignal[] {
    return this.db.all<LoxoneSignalRow>("SELECT * FROM loxone_signals WHERE miniserver_id = :miniserverId ORDER BY label, id", { miniserverId })
      .map(LoxoneSignalRepository.toSignal)
  }

  /** undefined when unknown */
  get(id: string): StoredLoxoneSignal | undefined {
    const row = this.db.get<LoxoneSignalRow>("SELECT * FROM loxone_signals WHERE id = :id", { id })
    return row && LoxoneSignalRepository.toSignal(row)
  }

  /** both rows are written atomically; throws when the Miniserver already has that packet id in that direction (unique constraint) */
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

  /**
   * replaces the config of a stored signal (same id and Miniserver); wires keep referring to it
   * @throws TypeError (a 500: runtime and database disagree) when no such signal is stored for that Miniserver
   */
  update(signal: StoredLoxoneSignal) {
    const { changes } = this.db.run(
      `UPDATE loxone_signals SET packet_id = :packetId, direction = :direction, data_type = :dataType, label = :label, slug = :slug
       WHERE id = :id AND miniserver_id = :miniserverId`,
      {
        id: signal.id, miniserverId: signal.miniserverId, packetId: signal.packetId, direction: signal.direction,
        dataType: signal.dataType, label: signal.label, slug: signal.slug ?? null
      }
    )
    if (changes !== 1) throw new TypeError(`loxone signal "${signal.id}" is not stored for miniserver "${signal.miniserverId}"`)
  }

  /** deleting the supertable row cascades to loxone_signals and to the signal's wires */
  delete(id: string) {
    this.db.run("DELETE FROM signals WHERE id = :id", { id })
  }

  // NULL slug becomes an absent field
  private static toSignal(row: LoxoneSignalRow): StoredLoxoneSignal {
    return {
      id: row.id, miniserverId: row.miniserver_id, packetId: row.packet_id, direction: row.direction,
      dataType: row.data_type, label: row.label, ...(row.slug === null ? {} : { slug: row.slug })
    }
  }
}
