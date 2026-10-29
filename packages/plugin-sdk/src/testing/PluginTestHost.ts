import { z } from "zod"
import { SystemClock, type Clock } from "../lifecycle/Clock.ts"
import type { PluginClass } from "../plugin/Plugin.ts"
import { PluginRuntime } from "../runtime/PluginRuntime.ts"
import type { Value } from "../values/Value.ts"
import type { HostMessage, HttpRequest } from "../wire/HostMessages.ts"
import type { CatalogNode, HttpResponse, Panel, PluginDescription } from "../wire/Shapes.ts"
import { WatchedValueSchema, type WatchedSignal, type WatchedValue } from "../wire/WatchShapes.ts"
import type { WorkerMessage } from "../wire/WorkerMessages.ts"
import { RejectionForwarder } from "./RejectionForwarder.ts"

// taken when this module loads, before a test can mock timers (mock.timers): waits for the plugin
// must time out for real, and a mocked tick must not end them early
const realSetTimeout = globalThis.setTimeout
const realClearTimeout = globalThis.clearTimeout

/** Options for PluginTestHost.start(). */
export interface TestHostOptions {
  /** validated against the plugin's config schema like in production; default `{}` */
  config?: unknown
  /** what the store contains at start, as if persisted by an earlier run */
  store?: Record<string, unknown>
  /** default "test" */
  instanceId?: string
  /** the instance's slug (Plugin.slug); default "test" */
  slug?: string
  /** the plugin's clock, usually a TestClock; default the system clock */
  clock?: Clock
  /** the installation's time zone the host sends (Plugin.timeZone); default none, so the server's */
  timeZone?: string
  /**
   * Hands this process's unhandled promise rejections to the plugin (Plugin.unhandledRejection) as
   * the worker would, from start until stop() returns, instead of letting node:test fail the test
   * with them. One such host at a time. Default false.
   */
  forwardRejections?: boolean
}

type Waiter = { match: (message: WorkerMessage) => boolean; resolve: (message: WorkerMessage) => void }

/**
 * Runs a plugin class in-process, through the same PluginRuntime that runs it in a worker, so a
 * plugin can be tested without Nexus. Records everything the plugin sends:
 *
 * ```ts
 * const host = await PluginTestHost.start(FroniusPlugin, { config: { host: "http://127.0.0.1:8080" } })
 * const pv = await host.addSensor("value", { path: "powerflow.Site.P_PV" })
 * assert.deepEqual(await host.next(pv), Value.number(3412))
 * await host.stop()
 * ```
 */
export class PluginTestHost<T extends PluginClass = PluginClass> {
  /**
   * every message the plugin sent, in order: emits, logs (`{ type: "log", level, message, data? }`),
   * status changes, store writes and responses. Assert on it for what no other member shows, such
   * as a log line.
   */
  readonly sent: WorkerMessage[] = []
  /** the store as the host would have persisted it; updated by the plugin's set() and delete(), read it back in assertions */
  readonly store: Record<string, unknown>
  private readonly runtime: PluginRuntime
  private readonly waiters = new Set<Waiter>()
  private rejections: RejectionForwarder | undefined
  private nextRequest = 1
  private nextSignal = 1

  private constructor(type: T, store: Record<string, unknown>, private readonly clock: Clock = SystemClock.instance) {
    this.store = { ...store }
    this.runtime = new PluginRuntime(type, message => this.receive(message), clock)
  }

  /**
   * Starts the plugin and waits for `ready`.
   * @throws Error with the plugin's message when init fails (invalid config, start threw)
   */
  static async start<T extends PluginClass>(type: T, options: TestHostOptions = {}): Promise<PluginTestHost<T>> {
    const host = new PluginTestHost(type, options.store ?? {}, options.clock)
    if (options.forwardRejections) host.rejections = new RejectionForwarder(reason => host.unhandledRejection(reason))
    try {
      const done = host.waitFor(message => message.type === "ready" || message.type === "failed")
      // awaited together, so a timeout of `done` while init still runs is never unhandled
      const [, outcome] = await Promise.all([
        host.runtime.handle({ type: "init", instanceId: options.instanceId ?? "test", slug: options.slug ?? "test", config: options.config ?? {}, store: host.store,
          ...(options.timeZone === undefined ? {} : { timeZone: options.timeZone }) }),
        done
      ])
      if (outcome.type === "failed") throw new Error(outcome.error)
      return host
    } catch (error) {
      await host.rejections?.restore()
      throw error
    }
  }

  /** the description the UI gets (config and params as JSON Schema), without starting the plugin; throws for invalid static declarations */
  static async describe(type: PluginClass) {
    return await new PluginTestHost(type, {}).request({ type: "describe", requestId: 0 }) as PluginDescription
  }

  /**
   * Adds and starts a sensor, like the host does when the user configures a signal; the call
   * resolves after the sensor's start(). Ids are generated ("sensor-1", "sensor-2", …).
   * @param params checked against the capability's `params` schema, defaults applied; default `{}`
   * @param label the signal's name (`this.signal.label`); default "" like an older host
   * @returns the new signal's id; @throws Error for unknown capabilities, invalid params or a failing start
   */
  async addSensor(capability: string, params: unknown = {}, label?: string) {
    return this.add("sensor", capability, params, label)
  }

  /** Adds an actuator like addSensor() does for a sensor. @returns the new signal's id; throws like addSensor() */
  async addActuator(capability: string, params: unknown = {}, label?: string) {
    return this.add("actuator", capability, params, label)
  }

  /** disposes the signal's sensor or actuator, as when the user deletes it; unknown ids are ignored */
  async remove(id: string) {
    await this.request({ type: "signal.remove", requestId: this.nextRequest++, id })
  }

  /** the plugin instance, typed as its class, for reaching into it from a test */
  get plugin(): InstanceType<T> {
    const plugin = this.runtime.current
    if (!plugin) throw new Error("the plugin is not initialized")
    return plugin as InstanceType<T>
  }

  /** every value the signal emitted so far */
  values(id: string): Value[] {
    return this.sent.flatMap(message => (message.type === "emit" && message.signalId === id ? [message.value] : []))
  }

  /** waits for the next value emitted after this call (earlier ones are in values()); @throws after `timeoutMs` */
  async next(id: string, timeoutMs = 2000): Promise<Value> {
    const message = await this.waitFor(m => m.type === "emit" && m.signalId === id, timeoutMs)
    return (message as Extract<WorkerMessage, { type: "emit" }>).value
  }

  /**
   * runs an actuator; @throws Error with the message run() threw
   * @param causeId the bus message it answers; emits and logs while it runs carry it
   */
  async actuate(id: string, value: Value, causeId?: string) {
    await this.request({ type: "actuate", requestId: this.nextRequest++, signalId: id, value, ...(causeId ? { causeId } : {}) })
  }

  /** calls Plugin.catalog() */
  async catalog() {
    return await this.request({ type: "catalog", requestId: this.nextRequest++ }) as CatalogNode[]
  }

  /** calls Plugin.panel() */
  async panel() {
    return await this.request({ type: "panel", requestId: this.nextRequest++ }) as Panel | undefined
  }

  /** runs an action like the Run button does; resolves with its message, rejects with its failure */
  async action(id: string, input: unknown = {}) {
    return await this.request({ type: "action", requestId: this.nextRequest++, action: id, input }) as string | undefined
  }

  /** Calls a webhook route; the method defaults to POST. An unknown route answers 404, a throwing handler rejects. */
  async http(request: Partial<HttpRequest> & Pick<HttpRequest, "path">) {
    const full = { method: "POST", query: {}, headers: {}, body: "", ...request }
    return await this.request({ type: "http.request", requestId: this.nextRequest++, request: full }) as Required<HttpResponse>
  }

  /** the last status the plugin reported, "running" if none */
  get status() {
    const last = this.sent.findLast(message => message.type === "status")
    return last?.type === "status" ? { status: last.status, message: last.message } : { status: "running" as const }
  }

  /**
   * Hands `reason` to the plugin as the worker would for an unhandled promise rejection. Real ones
   * only reach the plugin with `forwardRejections`; otherwise node:test keeps handling them.
   */
  unhandledRejection(reason: unknown) {
    this.runtime.rejected(reason)
  }

  /** the signals the user chose, for a plugin that declares `watches`; replaces the previous list */
  async watchSignals(signals: WatchedSignal[]) {
    await this.runtime.handle({ type: "watch.signals", signals })
  }

  /**
   * Delivers values of watched signals like the host does; resolves once the plugin acknowledged
   * the batch, i.e. its watched() finished. `ts` and `kind` default to now and "state".
   */
  async pushValues(values: Array<Omit<WatchedValue, "ts" | "kind"> & Partial<Pick<WatchedValue, "ts" | "kind">>>, dropped = 0) {
    const complete = values.map(value => ({ ts: this.clock.now(), kind: "state" as const, ...value }))
    // the worker would ignore an invalid message, and the ack would never come
    const checked = z.array(WatchedValueSchema).safeParse(complete)
    if (!checked.success) throw new Error(`invalid watched values: ${z.prettifyError(checked.error)}`)
    const seq = this.nextRequest++
    const acked = this.waitFor(m => m.type === "watch.ack" && m.seq === seq)
    await this.runtime.handle({ type: "watch.values", seq, values: checked.data, ...(dropped ? { dropped } : {}) })
    await acked
  }

  /** stops the plugin like the host would; resolves when it reported `stopped` */
  async stop() {
    try {
      const stopped = this.waitFor(message => message.type === "stopped")
      await this.runtime.handle({ type: "shutdown" })
      await stopped
    } finally {
      await this.rejections?.restore()
      this.rejections = undefined
    }
  }

  private async add(kind: "sensor" | "actuator", capability: string, params: unknown, label: string | undefined) {
    const id = `${kind}-${this.nextSignal++}`
    await this.request({ type: "signal.add", requestId: this.nextRequest++, signal: { id, kind, capability, params, ...(label === undefined ? {} : { label }) } })
    return id
  }

  private async request(message: Extract<HostMessage, { requestId: number }>) {
    const answered = this.waitFor(m => m.type === "response" && m.requestId === message.requestId)
    await this.runtime.handle(message)
    const response = await answered as Extract<WorkerMessage, { type: "response" }>
    if (!response.ok) throw new Error(response.error)
    return response.result
  }

  private receive(message: WorkerMessage) {
    // through structuredClone like the real worker boundary, so uncloneable data fails here too
    const copy = structuredClone(message)
    this.sent.push(copy)
    if (copy.type === "store.set") this.store[copy.key] = copy.value
    if (copy.type === "store.delete") delete this.store[copy.key]
    for (const waiter of [...this.waiters]) {
      if (!waiter.match(copy)) continue
      this.waiters.delete(waiter)
      waiter.resolve(copy)
    }
  }

  private waitFor(match: (message: WorkerMessage) => boolean, timeoutMs = 2000) {
    return new Promise<WorkerMessage>((resolve, reject) => {
      const timer = realSetTimeout(() => {
        this.waiters.delete(waiter)
        reject(new Error(`no matching message from the plugin within ${timeoutMs} ms`))
      }, timeoutMs)
      const waiter: Waiter = { match, resolve: message => (realClearTimeout(timer), resolve(message)) }
      this.waiters.add(waiter)
    })
  }
}
