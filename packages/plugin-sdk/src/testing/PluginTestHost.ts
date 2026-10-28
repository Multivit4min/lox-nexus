import type { PluginClass } from "../plugin/Plugin.ts"
import { PluginRuntime } from "../runtime/PluginRuntime.ts"
import type { Value } from "../values/Value.ts"
import type { HostMessage, HttpRequest } from "../wire/HostMessages.ts"
import type { CatalogNode, HttpResponse, Panel, PluginDescription } from "../wire/Shapes.ts"
import type { WorkerMessage } from "../wire/WorkerMessages.ts"

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
  /** every message the plugin sent, in order */
  readonly sent: WorkerMessage[] = []
  /** the store as the host would have persisted it */
  readonly store: Record<string, unknown>
  private readonly runtime: PluginRuntime
  private readonly waiters = new Set<Waiter>()
  private nextRequest = 1
  private nextSignal = 1

  private constructor(type: T, store: Record<string, unknown>) {
    this.store = { ...store }
    this.runtime = new PluginRuntime(type, message => this.receive(message))
  }

  /**
   * Starts the plugin and waits for `ready`.
   * @throws Error with the plugin's message when init fails (invalid config, start threw)
   */
  static async start<T extends PluginClass>(type: T, options: TestHostOptions = {}): Promise<PluginTestHost<T>> {
    const host = new PluginTestHost(type, options.store ?? {})
    const done = host.waitFor(message => message.type === "ready" || message.type === "failed")
    await host.runtime.handle({ type: "init", instanceId: options.instanceId ?? "test", slug: options.slug ?? "test", config: options.config ?? {}, store: host.store })
    const outcome = await done
    if (outcome.type === "failed") throw new Error(outcome.error)
    return host
  }

  /** describes the class without starting it */
  static async describe(type: PluginClass) {
    return await new PluginTestHost(type, {}).request({ type: "describe", requestId: 0 }) as PluginDescription
  }

  /**
   * @param label the signal's name (`this.signal.label`); default "" like an older host
   * @returns the new signal's id; @throws Error for unknown capabilities, invalid params or a failing start
   */
  async addSensor(capability: string, params: unknown = {}, label?: string) {
    return this.add("sensor", capability, params, label)
  }

  /** @returns the new signal's id; throws like addSensor() */
  async addActuator(capability: string, params: unknown = {}, label?: string) {
    return this.add("actuator", capability, params, label)
  }

  /** removes the signal; unknown ids are ignored */
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
   * Hands `reason` to the plugin as the worker would for an unhandled promise rejection (the test
   * process keeps its own handler, so real ones don't reach the plugin here).
   */
  unhandledRejection(reason: unknown) {
    this.runtime.rejected(reason)
  }

  /** stops the plugin like the host would; resolves when it reported `stopped` */
  async stop() {
    const stopped = this.waitFor(message => message.type === "stopped")
    await this.runtime.handle({ type: "shutdown" })
    await stopped
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
