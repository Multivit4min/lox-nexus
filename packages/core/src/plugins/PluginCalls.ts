import type { Value } from "@lox-nexus/plugin-sdk/values"
import { CatalogNodeSchema, HttpResponseSchema, PanelSchema, type HttpRequest, type SignalSpec } from "@lox-nexus/plugin-sdk/wire"
import type { BusMessage } from "../bus/BusMessage.ts"
import type { PluginSession } from "./PluginSession.ts"
import type { PluginBus, PluginSignals } from "./PluginSignals.ts"
import type { PluginSignalConfig } from "./PluginTypes.ts"

/** Thrown for calls that need the plugin running. */
export class PluginNotRunningError extends Error {
  constructor() {
    super("the plugin is not running")
  }
}

/**
 * Everything the host asks a running plugin for, with the answers validated: creating its
 * signals, actuating (reported as `result` on the bus), catalog, panel and webhooks. Signal
 * changes are registered on the bus at once and passed to the plugin when it runs.
 */
export class PluginCalls {
  constructor(
    private readonly session: () => PluginSession | undefined,
    private readonly signals: () => PluginSignals,
    private readonly bus: Pick<PluginBus, "result">
  ) {}

  /** creates every configured signal in a freshly started plugin; a refusal is kept on the signal */
  async addAll() {
    for (const spec of this.signals().specs()) await this.create(spec).catch(() => undefined)
  }

  /**
   * Registers the signal and, while running, creates it in the plugin.
   * @throws Error for an unknown capability or a taken topic; PluginRequestError when the plugin refuses (nothing is kept then)
   */
  async addSignal(config: PluginSignalConfig) {
    this.signals().add(config)
    try {
      await this.create(this.spec(config))
    } catch (error) {
      this.signals().remove(config.id)
      throw error
    }
  }

  /** Like addSignal for a changed signal; a refusal puts the previous config back. */
  async updateSignal(config: PluginSignalConfig) {
    const previous = this.signals().get(config.id)?.config
    if (!previous) throw new Error(`unknown signal "${config.id}"`)
    this.signals().update(config)
    try {
      await this.recreate(config)
    } catch (error) {
      // the refusal is what the caller needs to hear, even if putting the old config back fails too
      try {
        this.signals().update(previous)
      } catch {
        // the previous config was valid a moment ago; nothing better to do than keep the error
      }
      await this.recreate(previous).catch(() => undefined)
      throw error
    }
  }

  /** unregisters the signal (and its wires); the plugin disposes it if running */
  async removeSignal(id: string) {
    if (!this.signals().remove(id)) return false
    await this.session()?.request({ type: "signal.remove", id }).catch(() => undefined)
    return true
  }

  /**
   * Runs an actuator for a bus command and publishes the outcome as `result` under that command.
   * Returns at once: the outcome arrives later, and a plugin that isn't running reports failure.
   */
  actuate(signalId: string, value: Value, cause: BusMessage) {
    const signal = this.signals().get(signalId)
    if (!signal) return
    const { topic } = signal
    this.signals().rememberCause(cause)
    const session = this.session()
    const started = performance.now()
    const report = (ok: boolean, error?: string) =>
      this.bus.result(topic, { ok, ...(error ? { error } : {}), durationMs: Math.round(performance.now() - started) }, { source: this.signals().source, cause })
    // the plugin doesn't know an orphaned actuator, running or not; say why
    if (signal.orphaned) return report(false, signal.error)
    if (!session) return report(false, new PluginNotRunningError().message)
    session.request({ type: "actuate", signalId, value, causeId: cause.id })
      .then(() => report(true), (error: unknown) => report(false, error instanceof Error ? error.message : String(error)))
  }

  /** @throws PluginNotRunningError; Error when the plugin's answer isn't a valid catalog */
  async catalog() {
    return CatalogNodeSchema.array().parse(await this.running().request({ type: "catalog" }))
  }

  /** @throws PluginNotRunningError; Error when the plugin's answer isn't a valid panel. Resolves undefined when it has none. */
  async panel() {
    return PanelSchema.optional().parse(await this.running().request({ type: "panel" }))
  }

  /** a webhook call; @throws PluginNotRunningError, or the handler's error */
  async http(request: HttpRequest) {
    return HttpResponseSchema.parse(await this.running().request({ type: "http.request", request }))
  }

  private async create(spec: SignalSpec) {
    const session = this.session()
    if (!session) return
    // cleared before, not after: a sensor may report a failure from its start(), which arrives before the answer
    this.signals().setError(spec.id, undefined)
    try {
      await session.request({ type: "signal.add", signal: spec })
    } catch (error) {
      this.signals().setError(spec.id, error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  private async recreate(config: PluginSignalConfig) {
    await this.session()?.request({ type: "signal.remove", id: config.id }).catch(() => undefined)
    await this.create(this.spec(config))
  }

  private spec(config: PluginSignalConfig): SignalSpec {
    return { id: config.id, kind: config.kind, capability: config.capability, params: config.params }
  }

  private running() {
    const session = this.session()
    if (!session) throw new PluginNotRunningError()
    return session
  }
}
