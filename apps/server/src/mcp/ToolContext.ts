import type { AccessContext } from "../auth/AccessTokenService.ts"
import type { AuthUser } from "../auth/AuthService.ts"

/** Who calls a tool and how: the user behind the token, its scopes, and the `by` changes carry. */
export interface ToolContext {
  user: AuthUser
  access: AccessContext
  /** e.g. "admin via MCP (Claude Code)", for forces, logs and the topic cleanup */
  by: string
  /** aborted when the client goes away */
  signal: AbortSignal
}
