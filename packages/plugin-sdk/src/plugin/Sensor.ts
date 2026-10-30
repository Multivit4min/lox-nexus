import type { z } from "zod"
import { Disposable } from "../lifecycle/Disposable.ts"
import type { Value, ValueType } from "../values/Value.ts"
import type { Plugin } from "./Plugin.ts"
import type { SignalInfo } from "./SignalInfo.ts"

/** Where a sensor's values go; the runtime forwards them to the bus. */
export interface SensorOutput {
  /** sends a value to the bus, tagged with the cause of the work that is running (see Actuator) */
  emit(value: Value): void
  /** the sensor stopped working after it started; shown on the signal until it emits or recovers */
  fail(message: string): void
  /** the failure is over although there is no value to send; optional for outputs made elsewhere */
  recover?(): void
}

/**
 * A value coming from the device. Each configured sensor (a capability plus params) is one
 * instance, created when the signal is added and disposed when it is removed or the plugin stops.
 * Editing a signal's params in the UI disposes the instance and creates a new one, so start()
 * runs again with the new params; keep state that must outlive that in the plugin.
 *
 * A sensor has no value until it emits: in start(), emit what you already know (the plugin's
 * latest poll, the entity's current state), or the signal stays empty until the next change.
 *
 * The class declares itself with static fields (see SensorClass; only `id` is required):
 *
 * ```ts
 * export class PowerSensor extends Sensor<FroniusPlugin, { path: string }> {
 *   static readonly id = "power"
 *   static readonly params = z.object({ path: z.string() })
 *   static readonly valueType = "number"
 *   override start() { this.listen(this.plugin.poller, "data", data => this.emit(Value.number(...))) }
 * }
 * ```
 */
export abstract class Sensor<P extends Plugin = Plugin, Params = unknown> extends Disposable {
  /**
   * `plugin` is the plugin instance, for what sensors share (a poller, an API client). `params`
   * are validated against the static `params` schema before construction, with defaults applied,
   * and are available in field initializers. `signal` names
   * the configured signal this sensor is (for panels and log lines); a subclass that declares its
   * own constructor must pass it on to super().
   */
  constructor(readonly plugin: P, readonly params: Params, private readonly output: SensorOutput, readonly signal: SignalInfo = { id: "", label: "" }) {
    super()
    // tests may build a sensor without a plugin
    this.useClock(plugin?.clock)
  }

  /** the plugin's clock: `this.clock.now()` instead of `Date.now()`; every() and after() run on it */
  get clock() {
    return this.plugin.clock
  }

  // the failure still showing: recover() only tells the host when there is one, and the same fail() isn't sent twice.
  // ES-private, so a subclass's own `failed` can't collide with it
  #failedWith: string | undefined

  /**
   * Starts producing values. Called once, right after construction, when the signal is added; the
   * host waits for it (at most 30 seconds). A rejection makes adding the signal fail with the
   * message and disposes the sensor. Emitting from inside start() is allowed.
   */
  start(): void | Promise<void> {}

  /**
   * Sends a value to the bus, tagged with the cause of the work that is running. Equal consecutive
   * values are dropped there, so emit on every poll without comparing yourself. A value of another
   * type than the declared `valueType` is converted to it by the host before it is published. Clears a failure reported
   * with fail(). Does nothing once the sensor is disposed, so a late callback is harmless.
   */
  protected emit(value: Value) {
    if (this.isDisposed) return
    this.#failedWith = undefined
    this.output.emit(value)
  }

  /**
   * Reports that the sensor can't deliver values anymore, e.g. the entity it follows was deleted.
   * The message shows on the signal and the instance's error topic until the next emit() or
   * recover(). The last value stays on the bus. For a temporary outage of the whole device use
   * `plugin.status.set("degraded", …)` instead. Repeating the same message sends nothing.
   */
  protected fail(message: string) {
    if (this.isDisposed || message === this.#failedWith) return
    this.#failedWith = message
    this.output.fail(message)
  }

  /**
   * Clears a failure reported with fail() when the sensor works again but has no value to send
   * (an entity back as "unavailable"). Cheap to call often: it only tells the host after a fail().
   */
  protected recover() {
    if (this.isDisposed || this.#failedWith === undefined) return
    this.#failedWith = undefined
    this.output.recover?.()
  }
}

/** The static side of a sensor class, as the runtime sees it. */
export type SensorClass = (new (plugin: never, params: never, output: SensorOutput, signal?: SignalInfo) => Sensor<Plugin, unknown>) & {
  /** unique within the plugin; part of the stored signal, so don't rename it */
  readonly id: string
  /** shown in UIs; default: the id */
  readonly label?: string
  /** one sentence for UIs: what it reads or does, e.g. "The value of a sensor entity or one of its attributes" */
  readonly description?: string
  /** default: no params (an empty object) */
  readonly params?: z.ZodType
  /** what emit() sends, so wires can convert; default "any" (it varies) */
  readonly valueType?: ValueType | "any"
  /** the unit new signals of it show their values in, e.g. "W" (up to 16 characters); the user can change it */
  readonly unit?: string
  /** the decimals new signals of it round their values to for display (0-6); the user can change it */
  readonly decimals?: number
  /**
   * after how long without a value (an unchanged one counts) new signals of it warn that it is
   * stale, e.g. three poll intervals; rounded up to minutes. The user can change it.
   */
  readonly staleAfterMs?: number
}
