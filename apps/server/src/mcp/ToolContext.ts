import type { AccessContext } from "../auth/AccessTokenService.ts"
import type { AuthUser } from "../auth/AuthService.ts"
import type { Logger } from "pino"

/** Who calls a tool and how: the user behind the token, its scopes, and the `by` changes carry. */
export interface ToolContext {
  user: AuthUser
  access: AccessContext
  /** e.g. "admin via MCP (Claude Code)", for forces, logs and the topic cleanup */
  by: string
  /** aborted when the client goes away */
  signal: AbortSignal
  /** for failures the agent isn't shown (the request's logger) */
  log?: Pick<Logger, "error">
}
