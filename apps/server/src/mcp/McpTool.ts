import type { AccessScope } from "@lox-nexus/api"
import type { z } from "zod"
import type { ToolContext } from "./ToolContext.ts"

/** MCP's hints for clients; they don't grant or refuse anything themselves */
export interface ToolAnnotations {
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

/**
 * One tool an agent can call. Tools are thin: parse (done by ToolCall with `input`), call a
 * service the REST API uses too, and shape a compact answer. A string answer is sent as it is,
 * anything else as JSON.
 */
export interface McpTool<Input = unknown> {
  readonly name: string
  readonly title: string
  /** for the model: what it answers and when to use it */
  readonly description: string
  /** the scope a token needs to see and call it */
  readonly scope: AccessScope
  /** changes configuration: takes the ChangeLock and counts against the stricter rate limit */
  readonly changes?: boolean
  readonly annotations?: ToolAnnotations
  readonly input: z.ZodType<Input>
  run(input: Input, context: ToolContext): unknown
}
