import fs from "node:fs"
import path from "node:path"
import { backup, DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite"

/** Values a statement accepts as parameters. */
export type SqlParams = Record<string, SQLInputValue>

/**
 * The SQLite database, through Node's built-in synchronous driver (see ADR 0008). Synchronous on
 * purpose: the bus calls the ForceStore synchronously, and a local SQLite write takes microseconds.
 */
export class Database {
  private readonly db: DatabaseSync
  private readonly statements = new Map<string, StatementSync>()
  private depth = 0

  /** where it is stored; undefined in memory */
  readonly file: string | undefined

  /** @param file a path, or ":memory:" for tests. The directory is created with mode 0700 since the file holds password hashes and Miniserver passwords. */
  constructor(file: string) {
    this.file = file === ":memory:" ? undefined : file
    if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    this.db = new DatabaseSync(file)
    if (file !== ":memory:") fs.chmodSync(file, 0o600)
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000")
  }

  /** runs raw SQL (migrations); never pass user input here */
  exec(sql: string) {
    this.db.exec(sql)
  }

  /**
   * Prepared statements are cached per SQL text, so pass values as named parameters rather than
   * building the text, or the cache grows with every distinct string.
   */
  run(sql: string, params: SqlParams = {}) {
    return this.statement(sql).run(params)
  }

  /** first row, undefined when there is none */
  get<T>(sql: string, params: SqlParams = {}): T | undefined {
    return this.statement(sql).get(params) as T | undefined
  }

  /** all rows; T is trusted, not checked, so repositories validate what is not plain columns */
  all<T>(sql: string, params: SqlParams = {}): T[] {
    return this.statement(sql).all(params) as T[]
  }

  /**
   * Runs `work` atomically; a throw rolls it back. A nested call becomes a savepoint, so it is
   * atomic on its own even when the outer transaction catches its error and goes on.
   * `work` must be synchronous: an await inside would let other code interleave into the open
   * transaction. The outermost call takes the write lock up front (BEGIN IMMEDIATE), so it waits
   * for other writers (busy_timeout) instead of failing halfway.
   */
  transaction<T>(work: () => T): T {
    const savepoint = this.depth > 0 ? `nested_${this.depth}` : undefined
    this.db.exec(savepoint ? `SAVEPOINT ${savepoint}` : "BEGIN IMMEDIATE")
    this.depth++
    try {
      const result = work()
      this.db.exec(savepoint ? `RELEASE ${savepoint}` : "COMMIT")
      return result
    } catch (error) {
      this.rollback(savepoint)
      throw error
    } finally {
      this.depth--
    }
  }

  // after some errors (disk full, I/O) SQLite has already rolled back; a second ROLLBACK would
  // throw "no transaction is active" and hide the error that matters
  private rollback(savepoint: string | undefined) {
    if (!this.db.isTransaction) return
    this.db.exec(savepoint ? `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}` : "ROLLBACK")
  }

  /**
   * Copies the database into `file` while it stays in use (SQLite's online backup, a few hundred
   * pages per step, so a large file doesn't block the event loop). The copy is consistent.
   */
  async copyTo(file: string) {
    await backup(this.db, file, { rate: 500 })
  }

  /** closes the file; later calls are ignored. Pending WAL data is checkpointed by SQLite. */
  close() {
    if (this.db.isOpen) this.db.close()
  }

  // SQLite statements are bound to this connection and live until it closes
  private statement(sql: string) {
    let statement = this.statements.get(sql)
    if (!statement) {
      statement = this.db.prepare(sql)
      this.statements.set(sql, statement)
    }
    return statement
  }
}
