import https from "node:https"
import { Disposable } from "@lox-nexus/plugin-sdk"
import type { ConsoleAddress } from "../config/ConsoleAddress.ts"
import type { TlsPolicy } from "./TlsPolicy.ts"

/** a raw answer of the console */
export interface HttpAnswer {
  status: number
  body: string
}

/** what a request sends */
export interface HttpCall {
  method: "GET" | "POST" | "PUT" | "DELETE"
  path: string
  query?: Record<string, string>
  body?: unknown
}

/**
 * HTTPS to one console: the API key header, the certificate policy, a timeout on every request
 * (on the plugin's clock, through after()) and a size cap on answers. Stopping the plugin aborts
 * what is in flight. Each request uses its own connection, closed after the answer: polls are
 * seconds apart, and a pooled socket would outlive the plugin.
 */
export class ConsoleTransport extends Disposable {
  /** larger answers are refused rather than parsed; a site's full client list is far smaller */
  static readonly MAX_BODY_BYTES = 16 * 1024 * 1024
  private readonly stopped = new AbortController()

  constructor(readonly address: ConsoleAddress, readonly tls: TlsPolicy, private readonly apiKey: string, private readonly timeoutMs: number) {
    super()
    this.onDispose(() => this.close())
  }

  /** aborts what is in flight and refuses new requests; for a stop that must not wait for a slow console */
  close() {
    this.stopped.abort(new Error("the plugin stopped"))
  }

  /** @throws Error on a network or TLS failure, a timeout or an oversized answer; any HTTP status resolves */
  async request(call: HttpCall): Promise<HttpAnswer> {
    if (this.isDisposed || this.stopped.signal.aborted) throw new Error("the plugin stopped")
    const controller = new AbortController()
    const cancelTimer = this.after(this.timeoutMs, () => controller.abort(new Error(`no answer within ${this.timeoutMs / 1000} s`)))
    const stop = () => controller.abort(this.stopped.signal.reason)
    this.stopped.signal.addEventListener("abort", stop, { once: true })
    try {
      return await this.send(call, controller.signal)
    } finally {
      cancelTimer()
      this.stopped.signal.removeEventListener("abort", stop)
    }
  }

  private send(call: HttpCall, signal: AbortSignal): Promise<HttpAnswer> {
    const payload = call.body === undefined ? undefined : JSON.stringify(call.body)
    return new Promise((resolve, reject) => {
      const fail = (error: Error) => reject(signal.aborted && signal.reason instanceof Error ? signal.reason : error)
      const request = https.request(this.address.url(call.path, call.query), {
        method: call.method,
        signal,
        headers: this.headers(payload),
        createConnection: (_options, done) => {
          this.tls.connect(this.address, signal, done)
          return undefined
        }
      }, response => {
        const chunks: Buffer[] = []
        let size = 0
        response.on("data", (chunk: Buffer) => {
          size += chunk.length
          if (size > ConsoleTransport.MAX_BODY_BYTES) response.destroy(new Error("the console's answer is too large"))
          else chunks.push(chunk)
        })
        response.on("error", fail)
        response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }))
      })
      request.on("error", fail)
      request.end(payload)
    })
  }

  private headers(payload: string | undefined): Record<string, string> {
    return {
      "x-api-key": this.apiKey,
      accept: "application/json",
      connection: "close",
      ...(payload === undefined ? {} : { "content-type": "application/json", "content-length": String(Buffer.byteLength(payload)) })
    }
  }
}
