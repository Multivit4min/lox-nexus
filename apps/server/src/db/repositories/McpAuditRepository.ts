import type { Database } from "../Database.ts"

/** one audited agent call (migration 13) */
export interface McpAuditRow {
  at: number
  user_id: string
  token_id: string
  token_name: string
  tool: string
  /** masked JSON, cut */
  input: string
  outcome: "ok" | "refused" | "failed"
  detail: string | null
}

/** a stored entry: its token is gone (null) once revoked; the name stays */
export type McpAuditEntry = Omit<McpAuditRow, "token_id"> & { id: number; token_id: string | null }

/**
 * What agents changed or did through MCP; kept for 90 days and at most 10,000 entries per user,
 * so one busy agent doesn't push another user's entries out.
 */
export class McpAuditRepository {
  static readonly MAX_ROWS = 10_000
  static readonly MAX_AGE_MS = 90 * 86_400_000

  constructor(private readonly db: Database, private readonly limits = { rows: McpAuditRepository.MAX_ROWS, ageMs: McpAuditRepository.MAX_AGE_MS }) {}

  /** adds the entry and drops that user's entries that are too old or too many, so the table never grows past its limits */
  insert(row: McpAuditRow) {
    this.db.run(
      `INSERT INTO mcp_audit (at, user_id, token_id, token_name, tool, input, outcome, detail)
       VALUES (:at, :userId, :tokenId, :tokenName, :tool, :input, :outcome, :detail)`,
      { at: row.at, userId: row.user_id, tokenId: row.token_id, tokenName: row.token_name, tool: row.tool, input: row.input, outcome: row.outcome, detail: row.detail }
    )
    const userId = row.user_id
    this.db.run("DELETE FROM mcp_audit WHERE user_id = :userId AND at < :oldest", { userId, oldest: row.at - this.limits.ageMs })
    this.db.run(
      "DELETE FROM mcp_audit WHERE user_id = :userId AND id <= (SELECT id FROM mcp_audit WHERE user_id = :userId ORDER BY id DESC LIMIT 1 OFFSET :keep)",
      { userId, keep: this.limits.rows }
    )
  }

  /** a user's entries, newest first */
  recentFor(userId: string, limit: number) {
    return this.db.all<McpAuditEntry>("SELECT * FROM mcp_audit WHERE user_id = :userId ORDER BY id DESC LIMIT :limit", { userId, limit })
  }
}
