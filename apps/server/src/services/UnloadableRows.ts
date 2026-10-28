import type { UnloadableRowDto } from "@lox-nexus/api"

/**
 * Stored Miniservers and Loxone signals that couldn't be loaded at boot (a row a newer version
 * wrote, say). They don't run, but stay listed with the reason so they can be deleted through the
 * API instead of lingering invisibly in the database.
 */
export class UnloadableRows {
  private readonly rows = new Map<string, UnloadableRowDto>()

  add(row: UnloadableRowDto) {
    this.rows.set(row.id, row)
  }

  list(): UnloadableRowDto[] {
    return [...this.rows.values()]
  }

  /** the unloadable Miniserver with this id, if it is one */
  miniserver(id: string) {
    const row = this.rows.get(id)
    return row?.kind === "miniserver" ? row : undefined
  }

  /** the unloadable signal with this id on this Miniserver, if it is one */
  signal(miniserverId: string, id: string) {
    const row = this.rows.get(id)
    return row?.kind === "signal" && row.miniserverId === miniserverId ? row : undefined
  }

  /** forgets a row, and for a Miniserver the rows of its signals */
  forget(id: string) {
    this.rows.delete(id)
    for (const row of this.rows.values()) if (row.miniserverId === id) this.rows.delete(row.id)
  }
}
