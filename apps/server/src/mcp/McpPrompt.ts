import type { AccessScope } from "@lox-nexus/api"

/** A recipe an agent's user can pick (`prompts/get`): the steps of a task across the tools. */
export interface McpPrompt {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly arguments: readonly { name: string; description: string; required?: boolean }[]
  /** the scope the tools it uses need; a token without it doesn't see the prompt */
  readonly scope: AccessScope
  text(args: Record<string, string>): string
}
