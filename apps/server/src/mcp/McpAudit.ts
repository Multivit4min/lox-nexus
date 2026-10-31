import type { Logger } from "pino"
import type { ToolContext } from "./ToolContext.ts"

/**
 * What agents changed: one log line per changing tool call, with the token, the tool, its input
 * (secrets can't be in it: no tool takes them) and the outcome. Reads aren't logged; `last used`
 * on the token page shows activity. A3 adds a table for "recent activity".
 */
export class McpAudit {
  constructor(private readonly log: Pick<Logger, "info">) {}

  changed(context: ToolContext, tool: string, input: unknown, outcome: "ok" | "refused" | "failed", detail?: string) {
    this.log.info({ component: "mcp", token: context.access.tokenId, user: context.user.username, tool, input, outcome, ...(detail ? { detail } : {}) }, `${context.by}: ${tool} ${outcome}`)
  }
}
