import type { AccessScope } from "@lox-nexus/api"
import { z } from "zod"
import { JsonRpc } from "./JsonRpc.ts"
import { JsonRpcError } from "./JsonRpcError.ts"
import type { McpPrompt } from "./McpPrompt.ts"

// arguments arrive as strings, and land in the text the model reads: short ones only
const Args = z.record(z.string(), z.string().max(300)).default({})

/** The prompts, filtered by scope like the tools. */
export class PromptRegistry {
  constructor(private readonly prompts: readonly McpPrompt[]) {}

  list(scopes: readonly AccessScope[]) {
    return this.prompts.filter(prompt => scopes.includes(prompt.scope))
      .map(({ name, title, description, arguments: args }) => ({ name, title, description, arguments: args }))
  }

  /** @throws JsonRpcError for an unknown prompt, one the scopes don't allow, or missing arguments */
  get(name: string, rawArgs: unknown, scopes: readonly AccessScope[]) {
    const prompt = this.prompts.find(candidate => candidate.name === name && scopes.includes(candidate.scope))
    if (!prompt) throw new JsonRpcError(JsonRpc.INVALID_PARAMS, `unknown prompt ${name}, or one this token's scopes don't allow`)
    const parsed = Args.safeParse(rawArgs)
    if (!parsed.success) throw new JsonRpcError(JsonRpc.INVALID_PARAMS, z.prettifyError(parsed.error))
    const missing = prompt.arguments.filter(arg => arg.required && !parsed.data[arg.name])
    if (missing.length) throw new JsonRpcError(JsonRpc.INVALID_PARAMS, `missing arguments: ${missing.map(arg => arg.name).join(", ")}`)
    return { description: prompt.description, messages: [{ role: "user", content: { type: "text", text: prompt.text(parsed.data) } }] }
  }
}
