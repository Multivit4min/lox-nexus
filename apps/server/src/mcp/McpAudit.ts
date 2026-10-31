import type { Logger } from "pino"
import type { McpAuditRow } from "../db/repositories/McpAuditRepository.ts"
import { AuditInput } from "./AuditInput.ts"
import type { ToolContext } from "./ToolContext.ts"

/** where the audit goes besides the log: the table behind "Recent activity" */
export interface AuditStore {
  insert(row: McpAuditRow): void
}

/**
 * What agents changed or did: one log line and one table row per changing tool call, with the
 * token, the tool, its input (secret fields masked, see AuditInput) and the outcome. Reads aren't
 * audited; `last used` on the token page shows activity.
 */
export class McpAudit {
  private readonly inputs: AuditInput

  constructor(
    private readonly log: Pick<Logger, "info" | "warn">,
    private readonly store?: AuditStore,
    secretNames: () => ReadonlySet<string> = () => new Set(["password"]),
    private readonly now: () => number = () => Date.now()
  ) {
    this.inputs = new AuditInput(secretNames)
  }

  /** never throws: the change happened, and a full disk or a broken plugin description mustn't turn it into a failure */
  changed(context: ToolContext, tool: string, input: unknown, outcome: McpAuditRow["outcome"], detail?: string) {
    try {
      const text = this.inputs.text(input)
      this.log.info({ component: "mcp", token: context.access.tokenId, user: context.user.username, tool, input: text, outcome, ...(detail ? { detail } : {}) }, `${context.by}: ${tool} ${outcome}`)
      this.store?.insert({ at: this.now(), user_id: context.user.id, token_id: context.access.tokenId, token_name: context.access.name, tool, input: text, outcome, detail: detail ?? null })
    } catch (error) {
      try {
        this.log.warn({ err: error, tool }, "the MCP audit couldn't be written")
      } catch {
        // nothing left to tell
      }
    }
  }
}
