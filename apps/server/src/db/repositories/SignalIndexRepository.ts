import type { Database } from "../Database.ts"

/** The `signals` table: every configured signal, whatever owns it. What exists, not what runs. */
export class SignalIndexRepository {
  constructor(private readonly db: Database) {}

  exists(id: string) {
    return this.db.get("SELECT 1 FROM signals WHERE id = :id", { id }) !== undefined
  }
}
