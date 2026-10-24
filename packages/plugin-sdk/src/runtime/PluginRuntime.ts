import { z } from "zod"
import type { Plugin, PluginClass } from "../plugin/Plugin.ts"
import type { PluginContext, PluginLogger } from "../plugin/PluginContext.ts"
import { HostMessageSchema, WIRE_VERSION, type HostMessage } from "../wire/HostMessages.ts"
import type { LogLevel, WorkerMessage } from "../wire/WorkerMessages.ts"
import { CauseScope } from "./CauseScope.ts"
import { Declarations } from "./Declarations.ts"
import { PluginDescriber } from "./PluginDescriber.ts"
import { RouteTable } from "./RouteTable.ts"
import { RuntimeStore } from "./RuntimeStore.ts"
import { SignalHost } from "./SignalHost.ts"

type Request = Extract<HostMessage, { requestId: number }>

/**
 * Runs one plugin instance on the worker side: answers the host's messages and turns the plugin's
 * emits, logs, status and store writes into messages. The same class drives PluginTestHost, so
 * tests exercise exactly what runs in production.
 */
export class PluginRuntime {
  /** the longest text a message may carry; the host refuses longer ones */
  /** see the `text` bound in WorkerMessages; longer log, status and error texts are clipped to it */
  static readonly MAX_TEXT = 10_000
  private plugin: Plugin | undefined
  private signals: SignalHost | undefined
  private readonly routes = new RouteTable()

  constructor(private readonly type: PluginClass, private readonly send: (message: WorkerMessage) => void) {}

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
    return this.request(message)
  }

  private async init(message: Extract<HostMessage, { type: "init" }>) {
    if (this.plugin) return this.send({ type: "failed", error: "already initialized" })
    try {
      PluginDescriber.assertValid(this.type)
      const config = Declarations.config(this.type).safeParse(message.config)
      if (!config.success) throw new Error(`invalid config: ${z.prettifyError(config.error)}`)
      const plugin = this.plugin = new this.type(this.context(message.instanceId, config.data, message.store))
      this.signals = new SignalHost(this.type, plugin, this.send)
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
    }
  }

  // dispose errors are logged, not thrown: the host terminates the worker after `stopped` anyway
  private async shutdown() {
    await this.signals?.disposeAll()
    await this.plugin?.dispose().catch((error: unknown) => this.log("error", `stopping failed: ${PluginRuntime.text(error)}`))
    this.send({ type: "stopped" })
  }

  private started() {
    if (!this.plugin || !this.signals) throw new Error("the plugin is not initialized")
    return { plugin: this.plugin, signals: this.signals }
  }

  private context(instanceId: string, config: unknown, store: Record<string, unknown>): PluginContext {
    const log = Object.fromEntries((["debug", "info", "warn", "error"] as const).map(level =>
      [level, (message: string, data?: unknown) => this.log(level, message, data)])) as PluginLogger
    return {
      instanceId, config, log, http: this.routes,
      store: new RuntimeStore(store, this.send),
      status: { set: (status, message) => this.send({ type: "status", status, ...(message ? { message: PluginRuntime.clip(message) } : {}) }) }
    }
  }

  private log(level: LogLevel, message: string, data?: unknown) {
    const causeId = CauseScope.current()
    this.send({ type: "log", level, message: PluginRuntime.clip(String(message)), ...PluginRuntime.cloneable(data), ...(causeId ? { causeId } : {}) })
  }

  // data that can't cross the thread boundary (functions, sockets) is logged as text instead
  private static cloneable(data: unknown) {
    if (data === undefined) return {}
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
