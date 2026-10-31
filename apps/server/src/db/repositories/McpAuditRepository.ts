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

/** What agents changed or did through MCP; kept for 90 days and at most 10,000 entries. */
export class McpAuditRepository {
  static readonly MAX_ROWS = 10_000
  static readonly MAX_AGE_MS = 90 * 86_400_000

  constructor(private readonly db: Database, private readonly limits = { rows: McpAuditRepository.MAX_ROWS, ageMs: McpAuditRepository.MAX_AGE_MS }) {}

  /** adds the entry and drops what is too old or too many, so the table never grows past its limits */
  insert(row: McpAuditRow) {
    this.db.run(
      `INSERT INTO mcp_audit (at, user_id, token_id, token_name, tool, input, outcome, detail)
       VALUES (:at, :userId, :tokenId, :tokenName, :tool, :input, :outcome, :detail)`,
      { at: row.at, userId: row.user_id, tokenId: row.token_id, tokenName: row.token_name, tool: row.tool, input: row.input, outcome: row.outcome, detail: row.detail }
    )
    this.db.run("DELETE FROM mcp_audit WHERE at < :oldest", { oldest: row.at - this.limits.ageMs })
    this.db.run("DELETE FROM mcp_audit WHERE id <= (SELECT id FROM mcp_audit ORDER BY id DESC LIMIT 1 OFFSET :keep)", { keep: this.limits.rows })
  }

  /** a user's entries, newest first */
  recentFor(userId: string, limit: number) {
    return this.db.all<McpAuditRow & { id: number }>("SELECT * FROM mcp_audit WHERE user_id = :userId ORDER BY id DESC LIMIT :limit", { userId, limit })
  }
}
