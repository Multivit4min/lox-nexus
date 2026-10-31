import { Refusals } from "./Refusals.ts"
import type { ToolContext } from "./ToolContext.ts"

/** one item of a bulk change: its topic when it worked, else why not, so the agent fixes only those */
export type ItemResult = { ok: string } | { failed: string; error: string }

/** Runs a bulk change item by item: one refused item doesn't stop the others. */
export class BulkItems {
  static run<T>(items: readonly T[], name: (item: T) => string, work: (item: T) => string, context?: Pick<ToolContext, "log">): ItemResult[] {
    return items.map(item => {
      try {
        return { ok: work(item) }
      } catch (error) {
        return BulkItems.failure(item, name, error, context)
      }
    })
  }

  private static failure<T>(item: T, name: (item: T) => string, error: unknown, context?: Pick<ToolContext, "log">): ItemResult {
    const reason = Refusals.reason(error)
    if (!reason) context?.log?.error({ err: error, item: name(item) }, "an item of an MCP bulk change failed")
    return { failed: name(item), error: reason ?? Refusals.UNEXPECTED }
  }

  /** like run, one item after the other, for work that waits (a plugin checking a signal's params) */
  static async runAsync<T>(items: readonly T[], name: (item: T) => string, work: (item: T) => Promise<string>, context?: Pick<ToolContext, "log">): Promise<ItemResult[]> {
    const results: ItemResult[] = []
    for (const item of items) {
      try {
        results.push({ ok: await work(item) })
      } catch (error) {
        results.push(BulkItems.failure(item, name, error, context))
      }
    }
    return results
  }

  /** "2 of 5 items failed" for the audit, when any did */
  static failures(result: unknown): string | undefined {
    if (!Array.isArray(result)) return undefined
    const failed = result.filter(item => typeof item === "object" && item !== null && ("failed" in item || (item as { ok?: unknown }).ok === false)).length
    return failed > 0 ? `${failed} of ${result.length} items failed` : undefined
  }
}
