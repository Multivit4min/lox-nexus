import type { AccessScope } from "@lox-nexus/api"
import type { ToolContext } from "./ToolContext.ts"

/** A document an agent can attach to its context, e.g. the inventory; the same content as a read tool. */
export interface McpResource {
  readonly uri: string
  readonly name: string
  readonly title: string
  readonly description: string
  readonly mimeType: "text/plain" | "application/json" | "text/markdown"
  readonly scope: AccessScope
  read(context: ToolContext): unknown
}
