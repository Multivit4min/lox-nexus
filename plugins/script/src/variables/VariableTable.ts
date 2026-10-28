import type { Value } from "@lox-nexus/plugin-sdk/values"

/** "set": the script sends it with nexus.set; "receive": actuators pass it to nexus.on and nexus.get */
export type Direction = "set" | "receive"

/** What the plugin knows about one name in one direction. */
export interface VariableRecord {
  readonly name: string
  readonly direction: Direction
  /** set calls, or values received */
  calls: number
  lastAt?: number
  /** the latest value set or received */
  value?: Value
  /** sensors (set) or actuators (receive) using the name */
  signals: number
  /** the script used the name, so the catalog offers it */
  used: boolean
}

/**
 * The variables of an instance. New names the script uses are capped per direction, so a script
 * that makes up names (`nexus.set("t" + Date.now(), …)`) can't grow memory without bound; names
 * of signals are configured by the user and always get a record.
 */
export class VariableTable {
  static readonly LIMIT = 1000
  private readonly records = new Map<string, VariableRecord>()
  private readonly counts: Record<Direction, number> = { set: 0, receive: 0 }
  private readonly warned = new Set<Direction>()

  constructor(private readonly onLimit: (limit: number, direction: Direction) => void, private readonly limit = VariableTable.LIMIT) {}

  /** the record of a name the script used; undefined for a new name once the limit is reached */
  use(name: string, direction: Direction): VariableRecord | undefined {
    const record = this.find(name, direction) ?? this.create(name, direction, true)
    if (record) record.used = true
    return record
  }

  /** the record of a name a signal uses */
  signal(name: string, direction: Direction): VariableRecord {
    return this.find(name, direction) ?? this.create(name, direction, false) as VariableRecord
  }

  find(name: string, direction: Direction): VariableRecord | undefined {
    return this.records.get(VariableTable.key(name, direction))
  }

  /** every record, by name, values the script sets first */
  all(): VariableRecord[] {
    return [...this.records.values()].sort((a, b) => a.name.localeCompare(b.name) || a.direction.localeCompare(b.direction))
  }

  private create(name: string, direction: Direction, byScript: boolean): VariableRecord | undefined {
    if (byScript && this.counts[direction] >= this.limit) {
      if (!this.warned.has(direction)) this.onLimit(this.limit, direction)
      this.warned.add(direction)
      return undefined
    }
    this.counts[direction]++
    const record: VariableRecord = { name, direction, calls: 0, signals: 0, used: false }
    this.records.set(VariableTable.key(name, direction), record)
    return record
  }

  private static key(name: string, direction: Direction) {
    return `${direction}:${name}`
  }
}
