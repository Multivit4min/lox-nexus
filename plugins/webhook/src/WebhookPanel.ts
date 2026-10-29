import type { Panel } from "@lox-nexus/plugin-sdk"
import type { CallStats, Tally } from "./hooks/CallStats.ts"
import type { HookRegistry } from "./hooks/HookRegistry.ts"

/**
 * Three sections: how callers send the token (with the token, which is a plain config field, or a
 * warning without one), a table with a row per configured hook (its signals and counters), and the
 * calls refused before reaching a hook (wrong or missing token, unknown name).
 *
 * URLs show `<slug>` only with a host too old to tell the plugin its slug.
 */
export class WebhookPanel {
  static readonly columns = ["Hook", "URL", "Methods", "Signals", "Calls", "Last call", "Last result"]

  private readonly base: string

  constructor(
    private readonly hooks: HookRegistry,
    private readonly stats: CallStats,
    slug: string | undefined,
    private readonly token: string | undefined
  ) {
    this.base = `/hook/${slug ?? "<slug>"}`
  }

  build(): Panel {
    const { wrongToken, missingToken, unknownHook } = this.stats
    const tokens = { count: wrongToken.count + missingToken.count, ...WebhookPanel.latest(wrongToken, missingToken) }
    return {
      type: "sections",
      sections: [
        { title: "Token", panel: { type: "keyValue", items: this.tokenItems() } },
        { title: "Hooks", panel: { type: "table", columns: WebhookPanel.columns, rows: this.hooks.names().map(name => this.hookRow(name)) } },
        {
          title: "Refused calls",
          panel: {
            type: "keyValue",
            items: [
              { label: "Wrong or missing token (401)", value: tokens.count === 0 ? "none" : `${WebhookPanel.counted(tokens)} · wrong ${wrongToken.count}, missing ${missingToken.count}` },
              { label: `Unknown hook (404, under ${this.base}/…)`, value: WebhookPanel.counted(unknownHook) }
            ]
          }
        }
      ]
    }
  }

  private tokenItems() {
    const token = this.token
    if (token === undefined) return [{ label: "Token", value: "none: every call is accepted, so anyone who can reach Nexus can trigger these hooks. Not safe; set one in the instance settings." }]
    return [
      { label: "Token", value: token },
      { label: "As a header (preferred)", value: `Authorization: Bearer ${token}` },
      { label: "Or as this header", value: `X-Webhook-Token: ${token}` },
      { label: "In the URL (for callers that can't set headers)", value: `${this.base}/<hook>?token=${token}` },
      { label: "In the body", value: "not read: a token in the body is answered 401" }
    ]
  }

  private hookRow(name: string) {
    const handlers = this.hooks.handlers(name)
    const methods = [...new Set(handlers.map(handler => handler.method))].sort().join(", ")
    const signals = handlers.map(handler => handler.summary).sort().join("; ")
    const tally = this.stats.hook(name)
    return [name, `${this.base}/${name}`, methods, signals, String(tally?.count ?? 0), WebhookPanel.time(tally?.lastAt), tally?.lastResult ?? ""]
  }

  private static counted(tally: Tally) {
    return tally.count === 0 ? "none" : `${tally.count}, last ${WebhookPanel.time(tally.lastAt)}`
  }

  private static latest(a: Tally, b: Tally): Pick<Tally, "lastAt"> {
    const lastAt = Math.max(a.lastAt ?? -Infinity, b.lastAt ?? -Infinity)
    return Number.isFinite(lastAt) ? { lastAt } : {}
  }

  private static time(at: number | undefined) {
    return at === undefined ? "never" : new Date(at).toISOString()
  }
}
