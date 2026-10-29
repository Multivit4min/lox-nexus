import { z } from "zod"
import { SystemClock, type Clock } from "../lifecycle/Clock.ts"
import type { Plugin, PluginClass } from "../plugin/Plugin.ts"
import type { PluginContext, PluginLogger } from "../plugin/PluginContext.ts"
import { HostMessageSchema, WIRE_VERSION, type HostMessage } from "../wire/HostMessages.ts"
import type { LogLevel, WorkerMessage } from "../wire/WorkerMessages.ts"
import { ActionHost } from "./ActionHost.ts"
import { CauseScope } from "./CauseScope.ts"
import { Declarations } from "./Declarations.ts"
import { PluginDescriber } from "./PluginDescriber.ts"
import { MessageLimits } from "./MessageLimits.ts"
import { RouteTable } from "./RouteTable.ts"
import { RuntimeStore } from "./RuntimeStore.ts"
import { SignalHost } from "./SignalHost.ts"
import { WatchHost } from "./WatchHost.ts"

type Request = Extract<HostMessage, { requestId: number }>

/**
 * Runs one plugin instance on the worker side: answers the host's messages and turns the plugin's
 * emits, logs, status and store writes into messages. The same class drives PluginTestHost, so
 * tests exercise exactly what runs in production.
 */
export class PluginRuntime {
  /** the longest text a message may carry (the `text` bound in WorkerMessages); longer log, status and error texts are clipped to it */
  static readonly MAX_TEXT = 10_000
  private plugin: Plugin | undefined

  /** the plugin instance after init, for PluginTestHost; undefined before init and after a failed one */
  get current() {
    return this.plugin
  }
  private signals: SignalHost | undefined
  private actions: ActionHost | undefined
  private readonly routes = new RouteTable()
  private readonly watch: WatchHost

  /** @param clock what the plugin's timers and `clock.now()` run on; tests pass a TestClock */
  constructor(private readonly type: PluginClass, private readonly send: (message: WorkerMessage) => void, private readonly clock: Clock = SystemClock.instance) {
    this.watch = new WatchHost(send, error => this.log("error", `handling watched values failed: ${PluginRuntime.text(error)}`))
  }

  /** announces the wire version; the host sends `init` (or `describe`) after it */
  hello() {
    this.send({ type: "hello", version: WIRE_VERSION })
  }

  /** handles one host message; never throws (failures are answered as messages) */
  async handle(raw: unknown) {
    const parsed = HostMessageSchema.safeParse(raw)
    if (!parsed.success) return this.log("error", `ignored an invalid host message: ${z.prettifyError(parsed.error)}`)
    const message = parsed.data
    if (message.type === "init") return this.init(message)
    if (message.type === "ping") return this.send({ type: "pong", seq: message.seq })
    if (message.type === "shutdown") return this.shutdown()
    if (message.type === "watch.signals") return this.watch.setSignals(message.signals, () => this.plugin)
    if (message.type === "watch.values") return this.watch.values(message.seq, message.values, message.dropped ?? 0, () => this.plugin)
    return this.request(message)
  }

  private async init(message: Extract<HostMessage, { type: "init" }>) {
    if (this.plugin) return this.send({ type: "failed", error: "already initialized" })
    try {
      PluginDescriber.assertValid(this.type)
      const config = Declarations.config(this.type).safeParse(message.config)
      if (!config.success) throw new Error(`invalid config: ${z.prettifyError(config.error)}`)
      const plugin = this.plugin = new this.type(this.context(message, config.data))
      this.signals = new SignalHost(this.type, plugin, this.send)
      this.actions = new ActionHost(this.type, plugin, message => this.log("error", message))
      await plugin.start()
      this.send({ type: "ready" })
    } catch (error) {
      // what start() registered before it threw (timers, sockets) must not keep running
      await this.plugin?.dispose().catch(() => undefined)
      this.send({ type: "failed", error: PluginRuntime.text(error) })
    }
  }

  private async request(message: Request) {
    try {
      const result = await this.answer(message)
      const size = MessageLimits.size(result)
      // structuredClone carries a BigInt to the host, whose JSON answer then fails
      if (size === undefined) throw new Error("the answer can't be sent as JSON (a BigInt or a cycle?); format such values as text")
      if (size > MessageLimits.ANSWER) throw new Error(`the answer is ${MessageLimits.describe(size)}; the limit is ${MessageLimits.describe(MessageLimits.ANSWER)}`)
      this.send({ type: "response", requestId: message.requestId, ok: true, ...(result === undefined ? {} : { result }) })
    } catch (error) {
      this.send({ type: "response", requestId: message.requestId, ok: false, error: PluginRuntime.text(error) })
    }
  }

  private answer(message: Request): unknown {
    switch (message.type) {
      case "describe": return PluginDescriber.describe(this.type)
      case "signal.add": return this.started().signals.add(message.signal)
      case "signal.remove": return this.started().signals.remove(message.id)
      case "actuate": return this.started().signals.actuate(message.signalId, message.value, message.causeId)
      case "catalog": return this.started().plugin.catalog()
      case "panel": return this.started().plugin.panel()
      case "http.request": return this.routes.dispatch(message.request)
      case "action": return this.started().actions.run(message.action, message.input)
    }
  }

  // dispose errors are logged, not thrown: the host terminates the worker after `stopped` anyway
  private async shutdown() {
    // a batch being exported finishes first, so the plugin's last flush on dispose includes it
    await this.watch.idle()
    await this.actions?.dispose()
    await this.signals?.disposeAll()
    await this.plugin?.dispose().catch((error: unknown) => this.log("error", `stopping failed: ${PluginRuntime.text(error)}`))
    this.send({ type: "stopped" })
  }

  private started() {
    if (!this.plugin || !this.signals || !this.actions) throw new Error("the plugin is not initialized")
    return { plugin: this.plugin, signals: this.signals, actions: this.actions }
  }

  private context(init: Extract<HostMessage, { type: "init" }>, config: unknown): PluginContext {
    const { instanceId, slug, timeZone, store } = init
    const log = Object.fromEntries((["debug", "info", "warn", "error"] as const).map(level =>
      [level, (message: string, data?: unknown) => this.log(level, message, data)])) as PluginLogger
    return {
      instanceId, ...(slug === undefined ? {} : { slug }), ...(timeZone === undefined ? {} : { timeZone }), config, log, http: this.routes, watch: this.watch, clock: this.clock,
      store: new RuntimeStore(store, this.send),
      status: { set: (status, message) => this.send({ type: "status", status, ...(message ? { message: PluginRuntime.clip(message) } : {}) }) }
    }
  }

  /**
   * An unhandled promise rejection in this worker: handed to the plugin, or logged while there is
   * none (before init, after shutdown). Never throws, so the worker survives a forgotten `.catch`.
   */
  rejected(reason: unknown) {
    try {
      if (this.plugin && !this.plugin.isDisposed) return this.plugin.unhandledRejection(reason)
    } catch (error) {
      reason = error
    }
    this.log("error", `unhandled promise rejection: ${PluginRuntime.text(reason)}`, reason instanceof Error && reason.stack ? { stack: reason.stack } : undefined)
  }

  private log(level: LogLevel, message: string, data?: unknown) {
    const causeId = CauseScope.current()
    this.send({ type: "log", level, message: PluginRuntime.clip(String(message)), ...PluginRuntime.cloneable(data), ...(causeId ? { causeId } : {}) })
  }

  // data that can't cross the thread boundary (functions, sockets) is logged as text instead
  private static cloneable(data: unknown) {
    if (data === undefined) return {}
    const size = MessageLimits.size(data)
    if (size !== undefined && size > MessageLimits.LOG_DATA) return { data: `[log data left out: ${MessageLimits.describe(size)}, more than ${MessageLimits.describe(MessageLimits.LOG_DATA)}]` }
    try {
      return { data: structuredClone(data) }
    } catch {
      return { data: String(data) }
    }
  }

  private static text(error: unknown) {
    return PluginRuntime.clip(error instanceof Error ? error.message : String(error))
  }

  private static clip(text: string) {
    return text.length > PluginRuntime.MAX_TEXT ? `${text.slice(0, PluginRuntime.MAX_TEXT - 1)}…` : text
  }
}
