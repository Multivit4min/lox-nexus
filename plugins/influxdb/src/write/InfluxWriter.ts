import { promisify } from "node:util"
import { gzip } from "node:zlib"
import { Disposable } from "@lox-nexus/plugin-sdk"
import type { ExportHealth } from "./ExportHealth.ts"
import { RetryPolicy, type Outcome } from "./RetryPolicy.ts"
import type { WriteBuffer } from "./WriteBuffer.ts"
import type { WriteEndpoint } from "./WriteEndpoint.ts"

const compress = promisify(gzip)

export interface WriterOptions {
  flushMs: number
  batchSize: number
  gzip: boolean
  /** per request */
  timeoutMs: number
}

/** The parts a writer works with. */
export interface WriterParts {
  endpoint: WriteEndpoint
  buffer: WriteBuffer
  policy: RetryPolicy
  health: ExportHealth
}

/**
 * Moves lines from the buffer to InfluxDB, one request at a time: every `flushMs`, and right away
 * when a full batch is waiting. A batch that failed in a way worth retrying is kept and sent again
 * after the policy's delay, while new lines wait in the buffer; nothing else is sent meanwhile, so
 * points arrive in order. A batch too large for the server (413) is halved, and batches stay at
 * most that size for the rest of the run.
 *
 * Request timeouts are timers of this object, so they end with it and follow faked clocks in tests.
 */
export class InfluxWriter extends Disposable {
  private batch: string[] | undefined
  private sending: Promise<void> | undefined
  private cancelRetry: (() => void) | undefined
  /** send the next batch as soon as this one settled (after a split) */
  private again = false
  private closing = false
  private limit: number
  private readonly aborter = new AbortController()

  constructor(private readonly parts: WriterParts, private readonly options: WriterOptions) {
    super()
    this.limit = options.batchSize
    this.onDispose(() => this.aborter.abort())
  }

  start() {
    this.every(this.options.flushMs, () => this.flush())
  }

  /** asks InfluxDB's health endpoint once and reports when it doesn't answer well; never rejects */
  async check() {
    try {
      const result = await this.timed(signal => this.parts.endpoint.check(signal))
      if (result.status >= 300 && !this.closing) this.parts.health.checkFailed(`HTTP ${result.status}${result.body ? `: ${result.body}` : ""}`)
    } catch (error) {
      if (!this.closing && !this.isDisposed) this.parts.health.checkFailed(`InfluxDB unreachable: ${RetryPolicy.describe(error)}`)
    }
  }

  /** lines were added: writes now if a full batch is waiting */
  added() {
    if (this.parts.buffer.waiting >= this.limit) this.flush()
  }

  /** sends the next batch, unless a request is running or a retry is pending */
  flush() {
    if (this.sending || this.cancelRetry || this.closing || this.isDisposed) return
    const batch = this.next()
    if (!batch) return
    this.sending = this.send(batch).then(() => {
      this.sending = undefined
      if (!this.again) return this.added()
      this.again = false
      this.flush()
    })
  }

  /** resolves when no request is running (also one started by the last one finishing) */
  async settled() {
    while (this.sending) await this.sending
  }

  /**
   * At stop: no more retries; waits for a running request, then sends what is left batch by
   * batch until a write fails or `ms` are over. What is still unwritten then is lost, and logged.
   */
  async close(ms: number) {
    this.closing = true
    this.cancelRetry?.()
    this.cancelRetry = undefined
    const cancel = this.after(ms, () => this.aborter.abort(new DOMException("stopping", "AbortError")))
    try {
      await this.sending
      for (let batch = this.next(); batch && !this.aborter.signal.aborted; batch = this.next()) {
        const kind = await this.send(batch)
        if (kind !== "ok" && kind !== "reject") break
      }
    } finally {
      cancel()
    }
    this.parts.health.unwritten(this.parts.buffer.size)
  }

  /** the held batch, or a new one; undefined when nothing is waiting */
  private next() {
    const batch = this.batch ?? this.parts.buffer.take(this.limit)
    this.batch = batch.length > 0 ? batch : undefined
    return this.batch
  }

  /** never rejects: every failure becomes an outcome */
  private async send(batch: string[]): Promise<Outcome["kind"]> {
    const started = performance.now()
    let outcome: Outcome
    try {
      const text = Buffer.from(batch.join("\n"))
      const body = this.options.gzip ? await compress(text) : text
      const result = await this.timed(signal => this.parts.endpoint.write(body, this.options.gzip, signal))
      outcome = this.parts.policy.answer(result, Date.now(), batch.length)
    } catch (error) {
      outcome = this.parts.policy.error(error)
    }
    this.apply(outcome, batch, performance.now() - started)
    return outcome.kind
  }

  /** runs a request, aborted after the timeout or when the writer stops */
  private async timed<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const request = new AbortController()
    const cancel = this.after(this.options.timeoutMs, () => request.abort(new DOMException("timed out", "TimeoutError")))
    try {
      return await run(AbortSignal.any([this.aborter.signal, request.signal]))
    } finally {
      cancel()
    }
  }

  private apply(outcome: Outcome, batch: string[], latencyMs: number) {
    // failures while stopping (often the stop's own abort) aren't reported: close() says what is left
    if (outcome.kind === "retry" || outcome.kind === "split") {
      if (this.closing || this.isDisposed) return
      return outcome.kind === "retry" ? this.retryLater(outcome) : this.split(batch, outcome)
    }
    this.batch = undefined
    this.parts.buffer.release()
    if (outcome.kind === "ok") this.parts.health.succeeded(batch.length, latencyMs)
    else this.parts.health.rejected(batch.length, outcome.reason)
  }

  private retryLater(outcome: Extract<Outcome, { kind: "retry" }>) {
    this.parts.health.failed(outcome.reason, outcome.delayMs, outcome.degraded)
    this.cancelRetry = this.after(outcome.delayMs, () => {
      this.cancelRetry = undefined
      this.flush()
    })
  }

  private split(batch: string[], outcome: Extract<Outcome, { kind: "split" }>) {
    this.limit = Math.ceil(batch.length / 2)
    this.batch = batch.slice(0, this.limit)
    this.parts.buffer.giveBack(batch.slice(this.limit))
    this.parts.health.failed(outcome.reason, 0, outcome.degraded)
    this.again = true
  }
}
