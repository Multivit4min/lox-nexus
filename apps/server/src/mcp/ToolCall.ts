import { SystemClock, type Clock } from "@lox-nexus/plugin-sdk"
import { z } from "zod"
import type { Logger } from "pino"
import type { ChangeLock } from "../http/ChangeLock.ts"
import { BulkItems } from "./BulkItems.ts"
import type { Confirmations } from "./Confirmations.ts"
import type { McpAudit } from "./McpAudit.ts"
import type { McpRateLimit } from "./McpRateLimit.ts"
import type { McpTool } from "./McpTool.ts"
import { Refusals } from "./Refusals.ts"
import type { ToolContext } from "./ToolContext.ts"

/** what tools/call answers: text content, `isError` for refusals the model can act on */
export interface ToolResult {
  content: { type: "text"; text: string }[]
  isError?: true
}

type Outcome = { result: ToolResult; settled: Promise<unknown> }

/**
 * Runs one tool call with the rules every tool shares: the rate limit, confirmations for
 * destructive tools, the ChangeLock for changing tools, input checking, a deadline, the 64 KB cap
 * and the audit. Refusals (invalid input, a 400 or 409 from a service, a running config import)
 * come back as `isError` results with the reason, so the model can correct itself; only
 * unexpected failures are logged as errors.
 */
export class ToolCall {
  /** a result longer than this is cut, with a note on how to ask for less */
  static readonly MAX_TEXT = 64 * 1024
  /** how long the agent waits by default; a tool may set its own */
  static readonly TIMEOUT_MS = 30_000

  constructor(
    private readonly limit: Pick<McpRateLimit, "acquire">,
    private readonly lock: Pick<ChangeLock, "enter"> | undefined,
    private readonly audit: Pick<McpAudit, "changed">,
    private readonly log: Pick<Logger, "error">,
    private readonly confirmations?: Pick<Confirmations, "create" | "consume">,
    private readonly clock: Pick<Clock, "setTimeout" | "clearTimeout"> = SystemClock.instance
  ) {}

  /** @throws JsonRpcError when the token is over its rate limit */
  async run(tool: McpTool, args: unknown, context: ToolContext): Promise<ToolResult> {
    const release = await this.limit.acquire(context.access.tokenId, tool.changes === true)
    let settled: Promise<unknown> = Promise.resolve()
    try {
      const parsed = tool.input.safeParse(args ?? {})
      if (!parsed.success) return ToolCall.refusal(`invalid arguments: ${z.prettifyError(parsed.error)}`)
      const confirmation = tool.confirm ? (parsed.data as { confirmation?: unknown }).confirmation : undefined
      if (tool.confirm && !this.confirmations) return ToolCall.refusal("this tool needs confirmations, which this server doesn't offer")
      if (tool.confirm && typeof confirmation !== "string") return await this.ask(tool, parsed.data, context)
      const outcome = await this.execute(tool, parsed.data, context, confirmation as string | undefined)
      settled = outcome.settled
      return outcome.result
    } finally {
      // a call past its deadline keeps its slot until it really ends
      void settled.finally(release)
    }
  }

  // the first call of a destructive tool: what it would take along, and the id for the second
  private async ask(tool: McpTool, input: unknown, context: ToolContext): Promise<ToolResult> {
    try {
      const { summary, bind } = await tool.confirm!(input, context)
      const id = this.confirmations!.create(context.access.tokenId, tool.name, { args: ToolCall.args(input), bind })
      return { content: [{ type: "text", text: JSON.stringify({ needsConfirmation: true, summary, confirmation: id, expiresInS: 300, then: "call again with the same arguments and this confirmation to do it" }) }] }
    } catch (error) {
      return this.answer(tool, error)
    }
  }

  // inside the lock, so an import can't change what the refs resolve to, and a busy lock doesn't use the id up
  private async confirmed(tool: McpTool, input: unknown, context: ToolContext, id: string) {
    const { bind } = await tool.confirm!(input, context)
    return this.confirmations!.consume(id, context.access.tokenId, tool.name, { args: ToolCall.args(input), bind })
  }

  private async execute(tool: McpTool, input: unknown, context: ToolContext, confirmation?: string): Promise<Outcome> {
    let unlock = () => {}
    const done = (result: ToolResult): Outcome => {
      unlock()
      return { result, settled: Promise.resolve() }
    }
    try {
      if (tool.changes) unlock = this.lock?.enter() ?? unlock
      if (confirmation !== undefined && !await this.confirmed(tool, input, context, confirmation)) {
        return done(ToolCall.refusal("unknown or expired confirmation, other arguments than the first call, or the signals changed since: call again without `confirmation`"))
      }
    } catch (error) {
      return done(this.failed(tool, input, context, error))
    }
    const running = Promise.resolve().then(() => tool.run(input, context))
    // the lock is held until the work really ends, also past the deadline: an import mustn't run under it
    const settled = running.then(() => {}, () => {}).finally(unlock)
    const ms = tool.timeoutMs ?? ToolCall.TIMEOUT_MS
    const outcome = await this.within(running, ms)
    if (outcome === "late") {
      // audited once it really ends, with what became of it
      if (tool.changes) running.then(value => this.audited(context, tool.name, input, value, `finished after the ${ms / 1000} s deadline`), error => void this.failed(tool, input, context, error))
      return { result: ToolCall.refusal(`no answer within ${ms / 1000} s; it goes on in the background, so check its result before trying again`), settled }
    }
    if ("error" in outcome) return { result: this.failed(tool, input, context, outcome.error), settled }
    if (tool.changes) this.audited(context, tool.name, input, outcome.value)
    return { result: { content: [{ type: "text", text: ToolCall.text(outcome.value) }] }, settled }
  }

  private audited(context: ToolContext, tool: string, input: unknown, value: unknown, note?: string) {
    const detail = [note, BulkItems.failures(value)].filter(Boolean).join("; ")
    this.audit.changed(context, tool, input, "ok", detail || undefined)
  }

  private failed(tool: McpTool, input: unknown, context: ToolContext, error: unknown): ToolResult {
    const refusal = Refusals.reason(error)
    if (tool.changes) this.audit.changed(context, tool.name, input, refusal ? "refused" : "failed", refusal)
    return this.answer(tool, error)
  }

  private answer(tool: McpTool, error: unknown): ToolResult {
    const refusal = Refusals.reason(error)
    if (refusal) return ToolCall.refusal(refusal)
    this.log.error({ err: error, tool: tool.name }, "MCP tool failed")
    return ToolCall.refusal(`the tool ${Refusals.UNEXPECTED}`)
  }

  private within(work: Promise<unknown>, ms: number): Promise<"late" | { value: unknown } | { error: unknown }> {
    return new Promise(resolve => {
      const timer = this.clock.setTimeout(() => resolve("late"), ms)
      // a hung tool mustn't keep the process alive at shutdown
      ;(timer as { unref?: () => void }).unref?.()
      work.then(value => resolve({ value }), (error: unknown) => resolve({ error })).finally(() => this.clock.clearTimeout(timer))
    })
  }

  // the arguments a confirmation is bound to: all but the confirmation itself
  private static args(input: unknown) {
    return Object.fromEntries(Object.entries(input ?? {}).filter(([key]) => key !== "confirmation"))
  }

  private static refusal(text: string): ToolResult {
    return { content: [{ type: "text", text }], isError: true }
  }

  private static text(result: unknown) {
    const text = typeof result === "string" ? result : JSON.stringify(result ?? null)
    if (text.length <= ToolCall.MAX_TEXT) return text
    return `${text.slice(0, ToolCall.MAX_TEXT)}\n… cut at 64 KB: ask for less (a limit, a cursor or a filter)`
  }
}
