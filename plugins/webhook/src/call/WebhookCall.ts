import type { HttpRequest } from "@lox-nexus/plugin-sdk"

/** A body read as JSON or form data: the data, or why it can't be read that way. */
export type BodyRead<T> = { ok: true; data: T } | { ok: false; problem: string }

/**
 * One request to a hook, shared by every signal that handles it. The body is parsed lazily and at
 * most once per format, so ten value signals on one hook cost one JSON.parse.
 *
 * The content type decides only where it is unambiguous: a form-urlencoded body isn't read as
 * JSON and a JSON body isn't read as a form. Anything else (missing, text/plain, a vendor type) is
 * tried as whatever the signal expects, because many devices send JSON without saying so.
 */
export class WebhookCall {
  private jsonRead: BodyRead<unknown> | undefined
  private formRead: BodyRead<URLSearchParams> | undefined

  constructor(readonly request: HttpRequest) {}

  get method() {
    return this.request.method.toUpperCase()
  }

  get body() {
    return this.request.body
  }

  /** the media type without parameters, lowercase, e.g. "application/json" */
  get contentType() {
    return (this.request.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase() ?? ""
  }

  query(name: string): string | undefined {
    return Object.hasOwn(this.request.query, name) ? this.request.query[name] : undefined
  }

  json(): BodyRead<unknown> {
    this.jsonRead ??= this.readJson()
    return this.jsonRead
  }

  form(): BodyRead<URLSearchParams> {
    this.formRead ??= this.readForm()
    return this.formRead
  }

  private readJson(): BodyRead<unknown> {
    if (this.isForm()) return { ok: false, problem: "the body is form data, not JSON" }
    if (this.body.trim() === "") return { ok: false, problem: "the body is empty, expected JSON" }
    try {
      return { ok: true, data: JSON.parse(this.body) }
    } catch {
      return { ok: false, problem: "the body is not valid JSON" }
    }
  }

  private readForm(): BodyRead<URLSearchParams> {
    if (this.isJson()) return { ok: false, problem: "the body is JSON, not form data" }
    return { ok: true, data: new URLSearchParams(this.body) }
  }

  private isForm() {
    return this.contentType === "application/x-www-form-urlencoded"
  }

  private isJson() {
    return this.contentType === "application/json" || this.contentType.endsWith("+json")
  }
}
