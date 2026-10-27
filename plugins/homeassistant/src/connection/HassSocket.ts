import { EventEmitter } from "node:events"
import { Disposable } from "@lox-nexus/plugin-sdk"
import { InboundMessageSchema, type InboundMessage } from "./HassMessages.ts"

/** Home Assistant refused the token. Retrying won't help, and repeated attempts can get the address banned. */
export class HassAuthError extends Error {}

/** A request Home Assistant answered with `success: false`, e.g. an unknown service or an out-of-range value. */
export class HassError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
  }
}

type Pending = { resolve: (result: unknown) => void; reject: (error: Error) => void; cancel: () => void }

/** Options for HassSocket.open(). */
export interface OpenOptions {
  /** how long the handshake and each request may take; default TIMEOUT_MS */
  timeoutMs?: number
  /** aborting closes the socket and rejects a handshake still in progress */
  signal?: AbortSignal
}

/**
 * One authenticated session with Home Assistant's WebSocket API: the auth handshake, numbered
 * requests with their results, and subscriptions. When either side closes it, pending requests
 * fail and `closed` is emitted once; reconnecting is HassConnection's job.
 */
export class HassSocket extends Disposable {
  static readonly TIMEOUT_MS = 10_000
  readonly events = new EventEmitter<{ closed: [reason: string] }>()
  private readonly pending = new Map<number, Pending>()
  private readonly subscriptions = new Map<number, (event: unknown) => void>()
  private nextId = 1
  private closed = false

  private constructor(private readonly ws: WebSocket, readonly version: string, private readonly timeoutMs: number) {
    super()
    ws.addEventListener("message", event => this.receive(String(event.data)))
    ws.addEventListener("close", event => this.close(`closed by Home Assistant (${event.code})`))
    this.onDispose(() => this.close("closed"))
  }

  /**
   * Connects and logs in.
   * @throws HassAuthError when the token is rejected; Error when Home Assistant can't be reached, doesn't answer in time or the signal aborted
   */
  static open(url: string, token: string, { timeoutMs = HassSocket.TIMEOUT_MS, signal }: OpenOptions = {}): Promise<HassSocket> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new Error("connecting was cancelled"))
      const ws = new WebSocket(url)
      let version = ""
      const abort = () => fail(new Error("connecting was cancelled"))
      const settle = () => {
        clearTimeout(timer)
        ws.removeEventListener("message", handshake)
        signal?.removeEventListener("abort", abort)
      }
      const fail = (error: Error) => {
        settle()
        ws.close()
        reject(error)
      }
      const timer = setTimeout(() => fail(new Error(`no answer from ${url} within ${timeoutMs / 1000} s`)), timeoutMs)
      signal?.addEventListener("abort", abort)
      const handshake = (event: MessageEvent) => {
        const message = HassSocket.parse(String(event.data))
        if (message?.type === "auth_required") {
          version = message.ha_version ?? ""
          ws.send(JSON.stringify({ type: "auth", access_token: token }))
        } else if (message?.type === "auth_invalid") {
          fail(new HassAuthError(`Home Assistant rejected the token: ${message.message ?? "invalid"}`))
        } else if (message?.type === "auth_ok") {
          settle()
          resolve(new HassSocket(ws, version, timeoutMs))
        }
      }
      ws.addEventListener("message", handshake)
      ws.addEventListener("error", () => fail(new Error(`can't connect to ${url}`)))
      ws.addEventListener("close", event => fail(new Error(`${url} closed the connection (${event.code})`)))
    })
  }

  /**
   * Sends a request and resolves with its result.
   * @param timeoutMs default: the socket's timeout
   * @throws HassError when Home Assistant answers with an error; Error when closed or not answered in time
   */
  request(message: { type: string } & Record<string, unknown>, timeoutMs = this.timeoutMs): Promise<unknown> {
    return this.send(this.nextId++, message, timeoutMs)
  }

  /** subscribes (e.g. `subscribe_entities`); `onEvent` gets every event until the socket closes */
  async subscribe(message: { type: string } & Record<string, unknown>, onEvent: (event: unknown) => void) {
    const id = this.nextId++
    this.subscriptions.set(id, onEvent)
    await this.send(id, message, this.timeoutMs)
  }

  /** fails pending requests and closes the WebSocket; only the first call has an effect */
  close(reason: string) {
    if (this.closed) return
    this.closed = true
    for (const pending of this.pending.values()) {
      pending.cancel()
      pending.reject(new Error(`connection to Home Assistant ${reason}`))
    }
    this.pending.clear()
    this.subscriptions.clear()
    this.ws.close()
    this.events.emit("closed", reason)
  }

  private send(id: number, message: Record<string, unknown>, timeoutMs: number) {
    if (this.closed) return Promise.reject(new Error("not connected to Home Assistant"))
    return new Promise((resolve, reject) => {
      const cancel = this.after(timeoutMs, () => {
        this.pending.delete(id)
        reject(new Error(`Home Assistant didn't answer "${String(message.type)}" within ${timeoutMs / 1000} s`))
      })
      this.pending.set(id, { resolve, reject, cancel })
      try {
        this.ws.send(JSON.stringify({ id, ...message }))
      } catch (error) {
        this.pending.delete(id)
        cancel()
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  private receive(data: string) {
    const message = HassSocket.parse(data)
    if (message?.id === undefined) return
    if (message.type === "event") return this.subscriptions.get(message.id)?.(message.event)
    const pending = this.pending.get(message.id)
    if (!pending || (message.type !== "result" && message.type !== "pong")) return
    this.pending.delete(message.id)
    pending.cancel()
    if (message.type === "pong" || message.success) pending.resolve(message.result)
    else pending.reject(new HassError(message.error?.code ?? "unknown_error", message.error?.message ?? "request failed"))
  }

  private static parse(data: string): InboundMessage | undefined {
    try {
      const parsed = InboundMessageSchema.safeParse(JSON.parse(data))
      return parsed.success ? parsed.data : undefined
    } catch {
      return undefined
    }
  }
}
