import fs from "node:fs"
import path from "node:path"
import { DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite"

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

  /** @param file a path, or ":memory:" for tests. The directory is created with mode 0700 since the file holds password hashes and Miniserver passwords. */
  constructor(file: string) {
    if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    this.db = new DatabaseSync(file)
    if (file !== ":memory:") fs.chmodSync(file, 0o600)
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000")
  }

  /** runs raw SQL (migrations); never pass user input here */
  exec(sql: string) {
    this.db.exec(sql)
  }

  /** prepared statements are cached per SQL text */
  run(sql: string, params: SqlParams = {}) {
    return this.statement(sql).run(params)
  }

  /** first row, undefined when there is none */
  get<T>(sql: string, params: SqlParams = {}): T | undefined {
    return this.statement(sql).get(params) as T | undefined
  }

  all<T>(sql: string, params: SqlParams = {}): T[] {
    return this.statement(sql).all(params) as T[]
  }

  /** Runs `work` atomically. Nested calls join the outer transaction; a throw rolls back everything. */
  transaction<T>(work: () => T): T {
    if (this.depth > 0) return work()
    this.db.exec("BEGIN IMMEDIATE")
    this.depth++
    try {
      const result = work()
      this.db.exec("COMMIT")
      return result
    } catch (error) {
      this.db.exec("ROLLBACK")
      throw error
    } finally {
      this.depth--
    }
  }

  close() {
    if (this.db.isOpen) this.db.close()
  }

  private statement(sql: string) {
    let statement = this.statements.get(sql)
    if (!statement) {
      statement = this.db.prepare(sql)
      this.statements.set(sql, statement)
    }
    return statement
  }
}
