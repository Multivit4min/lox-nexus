import type { SelectionMode, SelectionRule, SelectionTarget } from "@lox-nexus/core"
import type { Database } from "../Database.ts"

interface RuleRow {
  signal_id: string | null
  miniserver_id: string | null
  instance_id: string | null
  include: number
}

/**
 * Which signals a consumer takes: its mode and its rules. Rules go with the signal, Miniserver or
 * plugin instance they name (foreign keys), so they never outlive their target.
 */
export class SelectionRepository {
  constructor(private readonly db: Database) {}

  /** undefined when the consumer has none stored yet */
  mode(consumer: string): SelectionMode | undefined {
    return this.db.get<{ mode: SelectionMode }>("SELECT mode FROM selection_modes WHERE consumer = :consumer", { consumer })?.mode
  }

  setMode(consumer: string, mode: SelectionMode) {
    this.db.run("INSERT INTO selection_modes (consumer, mode) VALUES (:consumer, :mode) ON CONFLICT (consumer) DO UPDATE SET mode = excluded.mode", { consumer, mode })
  }

  rules(consumer: string): SelectionRule[] {
    return this.db.all<RuleRow>("SELECT signal_id, miniserver_id, instance_id, include FROM selection_rules WHERE consumer = :consumer", { consumer })
      .map(row => ({ target: SelectionRepository.target(row), include: row.include === 1 }))
  }

  /**
   * Sets or (with `include` null) removes the rule on one target.
   * @throws SQLite constraint error when the target doesn't exist
   */
  setRule(consumer: string, target: SelectionTarget, include: boolean | null) {
    const [column, id] = SelectionRepository.column(target)
    this.db.transaction(() => {
      this.db.run(`DELETE FROM selection_rules WHERE consumer = :consumer AND ${column} = :id`, { consumer, id })
      if (include !== null) this.db.run(`INSERT INTO selection_rules (consumer, ${column}, include) VALUES (:consumer, :id, :include)`, { consumer, id, include: include ? 1 : 0 })
    })
  }

  /** for a consumer that is gone, e.g. a deleted plugin instance */
  forget(consumer: string) {
    this.db.transaction(() => {
      this.db.run("DELETE FROM selection_rules WHERE consumer = :consumer", { consumer })
      this.db.run("DELETE FROM selection_modes WHERE consumer = :consumer", { consumer })
    })
  }

  // the column names come from this fixed list, never from input
  private static column(target: SelectionTarget): ["signal_id" | "miniserver_id" | "instance_id", string] {
    if ("signalId" in target) return ["signal_id", target.signalId]
    if ("miniserverId" in target) return ["miniserver_id", target.miniserverId]
    return ["instance_id", target.instanceId]
  }

  private static target(row: RuleRow): SelectionTarget {
    if (row.signal_id !== null) return { signalId: row.signal_id }
    if (row.miniserver_id !== null) return { miniserverId: row.miniserver_id }
    return { instanceId: row.instance_id! }
  }
}
