import { JsonPath } from "./JsonPath.ts"
import type { WebhookCall } from "./WebhookCall.ts"

export type SourceKind = "json" | "query" | "form" | "body"

/** What a source found in a call: the raw value, or a short reason for the caller's 400. */
export type Extraction = { ok: true; raw: unknown } | { ok: false; problem: string }

/**
 * Where a value signal reads its value from: a JSON path into the body, a query parameter, a
 * form field, or the raw body text. JSON gives any JSON value; the others always give strings.
 */
export class ValueSource {
  private readonly path: JsonPath | undefined

  constructor(readonly kind: SourceKind, private readonly key: string | undefined) {
    this.path = kind === "json" ? JsonPath.parse(key ?? "") : undefined
  }

  /** e.g. `json a.b[0]`, `query temp`, `body` */
  get summary() {
    return this.kind === "body" ? "body" : `${this.kind} ${this.key ?? ""}`
  }

  extract(call: WebhookCall): Extraction {
    switch (this.kind) {
      case "body": return { ok: true, raw: call.body }
      case "query": return this.found(call.query(this.key ?? ""), `query parameter "${this.key}" is missing`)
      case "form": return this.fromForm(call)
      case "json": return this.fromJson(call)
    }
  }

  private fromForm(call: WebhookCall): Extraction {
    const form = call.form()
    if (!form.ok) return form
    return this.found(form.data.get(this.key ?? "") ?? undefined, `form field "${this.key}" is missing`)
  }

  private fromJson(call: WebhookCall): Extraction {
    const json = call.json()
    if (!json.ok) return json
    const resolved = this.path?.resolve(json.data) ?? { found: false }
    return resolved.found ? { ok: true, raw: resolved.value } : { ok: false, problem: `JSON path "${this.key}" not found` }
  }

  private found(raw: string | undefined, problem: string): Extraction {
    return raw === undefined ? { ok: false, problem } : { ok: true, raw }
  }
}
