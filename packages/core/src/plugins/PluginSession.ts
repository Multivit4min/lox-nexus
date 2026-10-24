import { EventEmitter } from "node:events"
import { Disposable } from "@lox-nexus/plugin-sdk"
import { WIRE_VERSION, type HostMessage, type WorkerMessage } from "@lox-nexus/plugin-sdk/wire"
import type { PluginConnection } from "./PluginTransport.ts"
import { RequestTracker } from "./RequestTracker.ts"

/** Timeouts of a session, in ms; tests shorten them. */
export interface SessionTimings {
  /** from start until the plugin says hello */
  helloMs: number
  /** from init until ready (the plugin's start()) */
  initMs: number
  /** for every other request */
  requestMs: number
  pingMs: number
  /** unanswered pings in a row before the plugin counts as hung */
  missedPings: number
  /** how long a shutdown may take before the worker is terminated */
  graceMs: number
}

/** The plugin refused to start (invalid config, start() threw, wrong wire version): don't restart it. */
export class InitFailedError extends Error {}

/** Events of a session: plugin messages for the supervisor, and its unexpected end. */
export interface SessionEvents {
  /** emit, log, status, store and signal.error messages */
  message: [message: WorkerMessage]
  output: [stream: "stdout" | "stderr", line: string]
  /** the plugin is gone or broken (exit, out of memory, missed pings, invalid message); not sent for close() */
  ended: [reason: string]
}

type Request = Extract<HostMessage, { requestId: number }>
type RequestBody = Request extends infer R ? R extends Request ? Omit<R, "requestId"> : never : never

/**
 * One running plugin from hello to exit: the init handshake, requests matched to responses,
 * heartbeat pings and the graceful shutdown. Not reusable: a restart creates a new session.
 */
export class PluginSession extends Disposable {
  readonly events = new EventEmitter<SessionEvents>()
  private readonly requests = this.own(new RequestTracker())
  private unanswered = 0
  private closing = false
  private over = false
  private endReason = "stopped"
  /** pending waitFor() calls; they fail with the real reason when the session ends */
  private readonly waiting = new Set<(reason: string) => void>()

  constructor(private readonly connection: PluginConnection, private readonly timings: SessionTimings) {
    super()
    this.listen(connection, "message", (message: WorkerMessage) => this.receive(message))
    this.listen(connection, "output", (stream: "stdout" | "stderr", line: string) => this.events.emit("output", stream, line))
    this.listen(connection, "exit", (reason: string) => this.end(reason))
    this.listen(connection, "invalid", (reason: string) => this.fail(reason))
    this.onDispose(() => this.connection.terminate())
    this.onDispose(() => this.end("was stopped"))
  }

  /**
   * Waits for hello, sends init and waits for ready, then starts pinging.
   * @throws InitFailedError when the plugin refuses; Error when it times out or exits meanwhile
   */
  async open(init: Omit<Extract<HostMessage, { type: "init" }>, "type">) {
    await this.greet()
    const ready = this.waitFor(["ready", "failed"], this.timings.initMs, "finish starting")
    this.connection.send({ type: "init", ...init })
    const outcome = await ready
    if (outcome.type === "failed") throw new InitFailedError(outcome.error)
    this.every(this.timings.pingMs, () => this.ping())
  }

  /**
   * Waits for the plugin's hello and checks its wire version. open() starts with it; on its own
   * it is enough for `describe`, which needs no init.
   * @throws InitFailedError for another wire version; Error on timeout or exit
   */
  async greet() {
    const hello = await this.waitFor("hello", this.timings.helloMs, "say hello (does its entry call PluginEntry.define()?)")
    if (hello.type === "hello" && hello.version !== WIRE_VERSION) {
      throw new InitFailedError(`the plugin speaks wire version ${hello.version}, this Nexus ${WIRE_VERSION}`)
    }
  }

  /**
   * Sends a request and resolves with the plugin's result.
   * @throws PluginRequestError with the plugin's message, or Error on timeout or exit
   */
  request(body: RequestBody, timeoutMs = this.timings.requestMs): Promise<unknown> {
    if (this.over) return Promise.reject(new Error("the plugin is not running"))
    const { requestId, result } = this.requests.create(timeoutMs, body.type)
    this.connection.send({ ...body, requestId } as Request)
    return result
  }

  /** asks the plugin to stop, waits up to the grace period, then terminates it */
  async close() {
    if (this.over) return this.dispose()
    this.closing = true
    const stopped = this.waitFor("stopped", this.timings.graceMs, "stop").catch(() => undefined)
    this.connection.send({ type: "shutdown" })
    await stopped
    await this.dispose()
  }

  private receive(message: WorkerMessage) {
    if (message.type === "response") return this.requests.settle(message)
    if (message.type === "pong") return void (this.unanswered = 0)
    if (["emit", "log", "status", "store.set", "store.delete", "signal.error"].includes(message.type)) this.events.emit("message", message)
  }

  // a hung plugin can't answer; terminating it makes the exit report the reason
  private ping() {
    if (this.unanswered >= this.timings.missedPings) return this.fail(`did not answer ${this.unanswered} pings (hung or busy)`)
    this.unanswered++
    this.connection.send({ type: "ping", seq: this.unanswered })
  }

  private fail(reason: string) {
    this.end(reason)
    void this.connection.terminate().catch(() => undefined)
  }

  // an ended session disposes itself, or its ping interval would outlive the worker
  private end(reason: string) {
    if (this.over) return
    this.over = true
    this.endReason = reason
    for (const waiter of [...this.waiting]) waiter(reason)
    this.requests.failAll(`the plugin ${reason}`)
    if (!this.closing) this.events.emit("ended", reason)
    void this.dispose().catch(() => undefined)
  }

  // rejects on timeout and when the session ends first (exit, invalid message, dispose), with that reason
  private waitFor(types: WorkerMessage["type"] | WorkerMessage["type"][], timeoutMs: number, what: string) {
    const wanted = new Set(Array.isArray(types) ? types : [types])
    return new Promise<WorkerMessage>((resolve, reject) => {
      if (this.over) return reject(new Error(`the plugin ${this.endReason} before it could ${what}`))
      const done = () => {
        cancel()
        this.connection.off("message", onMessage)
        this.waiting.delete(onEnd)
      }
      const onMessage = (message: WorkerMessage) => {
        if (!wanted.has(message.type)) return
        done()
        resolve(message)
      }
      const onEnd = (reason: string) => {
        done()
        reject(new Error(`the plugin ${reason} before it could ${what}`))
      }
      const cancel = this.after(timeoutMs, () => {
        done()
        reject(new Error(`the plugin did not ${what} within ${timeoutMs} ms`))
      })
      this.connection.on("message", onMessage)
      this.waiting.add(onEnd)
    })
  }
}
