import type { Panel } from "@lox-nexus/plugin-sdk"
import type { CallStats, Tally } from "./hooks/CallStats.ts"
import type { HookRegistry } from "./hooks/HookRegistry.ts"

/**
 * One table: a row per configured hook with its signals and counters, then two rows for calls
 * refused before reaching a hook (token, unknown name). The SDK's panel is a single table or
 * key-value list, so the instance-wide counters are rows of the same table.
 *
 * URLs show `<slug>` only with a host too old to tell the plugin its slug. Never shows the token.
 */
export class WebhookPanel {
  static readonly columns = ["Hook", "URL", "Methods", "Signals", "Calls", "Last call", "Last result"]

  private readonly base: string

  constructor(private readonly hooks: HookRegistry, private readonly stats: CallStats, slug: string | undefined) {
    this.base = `/hook/${slug ?? "<slug>"}`
  }

  build(): Panel {
    const rows = this.hooks.names().map(name => this.hookRow(name))
    const { wrongToken, missingToken, unknownHook } = this.stats
    rows.push(this.rejectedRow("(wrong or missing token)", { count: wrongToken.count + missingToken.count, ...WebhookPanel.latest(wrongToken, missingToken) },
      `401: wrong token ${wrongToken.count}, missing token ${missingToken.count}`))
    rows.push(this.rejectedRow("(unknown hook)", unknownHook, "404"))
    return { type: "table", columns: WebhookPanel.columns, rows }
  }

  private hookRow(name: string) {
    const handlers = this.hooks.handlers(name)
    const methods = [...new Set(handlers.map(handler => handler.method))].sort().join(", ")
    const signals = handlers.map(handler => handler.summary).sort().join("; ")
    const tally = this.stats.hook(name)
    return [name, `${this.base}/${name}`, methods, signals, String(tally?.count ?? 0), WebhookPanel.time(tally?.lastAt), tally?.lastResult ?? ""]
  }

  private rejectedRow(label: string, tally: Tally, result: string) {
    return [label, `${this.base}/…`, "", "", String(tally.count), WebhookPanel.time(tally.lastAt), tally.count > 0 ? result : ""]
  }

  private static latest(a: Tally, b: Tally): Pick<Tally, "lastAt"> {
    const lastAt = Math.max(a.lastAt ?? -Infinity, b.lastAt ?? -Infinity)
    return Number.isFinite(lastAt) ? { lastAt } : {}
  }

  private static time(at: number | undefined) {
    return at === undefined ? "never" : new Date(at).toISOString()
  }
}
