import type { InfluxConfig } from "../InfluxConfig.ts"

/** InfluxDB's answer to a request, as far as deciding what to do next needs it. */
export interface WriteResult {
  status: number
  /** the Retry-After header, if any */
  retryAfter?: string
  /** the Location header of a redirect */
  location?: string
  /** the start of the response body, for error messages */
  body: string
}

/**
 * Where and how points are written: the write URL and its auth header, for the version 2 API
 * (`/api/v2/write?org=&bucket=`, `Authorization: Token …`; also InfluxDB 3) or the version 1 API
 * (`/write?db=&rp=`, basic auth). Always millisecond precision. A path in the configured URL is
 * kept as a prefix, for InfluxDB behind a reverse proxy.
 */
export class WriteEndpoint {
  /** characters of a response body kept for messages */
  static readonly BODY_LIMIT = 500
  /** bytes of a response body read at most; the rest is cancelled */
  static readonly READ_LIMIT = 4096

  private constructor(
    readonly url: URL,
    /** `/health` (v2, v3) or `/ping` (v1): answers without touching data */
    readonly healthUrl: URL,
    private readonly headers: Headers,
    readonly description: string
  ) {}

  static fromConfig(config: InfluxConfig): WriteEndpoint {
    const base = new URL(config.url)
    base.pathname = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`
    base.search = ""
    base.hash = ""
    const server = base.href.replace(/\/$/, "")
    if (config.api === "v2") {
      const url = WriteEndpoint.url(base, "api/v2/write", { org: config.org, bucket: config.bucket })
      const headers = WriteEndpoint.headers(`Token ${config.token ?? ""}`)
      return new WriteEndpoint(url, new URL("health", base), headers, `${server} · org ${config.org ?? ""} · bucket ${config.bucket ?? ""}`)
    }
    const url = WriteEndpoint.url(base, "write", { db: config.database, rp: config.retentionPolicy })
    const auth = config.username ? `Basic ${Buffer.from(`${config.username}:${config.password ?? ""}`).toString("base64")}` : undefined
    const policy = config.retentionPolicy ? ` (${config.retentionPolicy})` : ""
    const user = config.username ? ` · user ${config.username}` : ""
    return new WriteEndpoint(url, new URL("ping", base), WriteEndpoint.headers(auth), `${server} · database ${config.database ?? ""}${policy}${user}`)
  }

  /**
   * Posts a body of lines; throws for network errors and when `signal` aborts. Redirects are not
   * followed: they come back as a result, so the user can be told to fix the URL (and a token is
   * never sent on to another address).
   */
  write(body: Uint8Array, gzip: boolean, signal: AbortSignal): Promise<WriteResult> {
    const headers = new Headers(this.headers)
    headers.set("content-type", "text/plain; charset=utf-8")
    if (gzip) headers.set("content-encoding", "gzip")
    return this.request(this.url, { method: "POST", headers, body, signal })
  }

  /** asks the health endpoint; throws like write() */
  check(signal: AbortSignal): Promise<WriteResult> {
    return this.request(this.healthUrl, { method: "GET", headers: this.headers, signal })
  }

  private async request(url: URL, init: RequestInit): Promise<WriteResult> {
    const response = await fetch(url, { ...init, redirect: "manual" })
    const result: WriteResult = { status: response.status, body: await WriteEndpoint.head(response.body) }
    const retryAfter = response.headers.get("retry-after")
    const location = response.headers.get("location")
    if (retryAfter !== null) result.retryAfter = retryAfter
    if (location !== null) result.location = location
    return result
  }

  /** the start of a body (a few KB at most, so a huge error page isn't read whole) */
  private static async head(body: ReadableStream<Uint8Array> | null) {
    if (!body) return ""
    const reader = body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (size < WriteEndpoint.READ_LIMIT) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        size += value.byteLength
      }
    } finally {
      await reader.cancel().catch(() => undefined)
    }
    const text = Buffer.concat(chunks).subarray(0, WriteEndpoint.READ_LIMIT).toString("utf8")
    return text.slice(0, WriteEndpoint.BODY_LIMIT)
  }

  /** the shared headers, built once so a value a header can't carry fails at start, without quoting it */
  private static headers(authorization: string | undefined) {
    try {
      const headers = new Headers({ accept: "application/json" })
      if (authorization) headers.set("authorization", authorization)
      return headers
    } catch {
      throw new Error("the token or user contains characters an HTTP header can't carry")
    }
  }

  private static url(base: URL, path: string, query: Record<string, string | undefined>) {
    const url = new URL(path, base)
    for (const [key, value] of Object.entries(query)) if (value) url.searchParams.set(key, value)
    url.searchParams.set("precision", "ms")
    return url
  }
}
