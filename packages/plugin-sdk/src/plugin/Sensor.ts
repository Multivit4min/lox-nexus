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
   * `params` are validated against the static `params` schema before construction. `signal` names
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

  // whether a fail() is still showing, so recover() only tells the host when there is something to clear
  private failed = false

  /** Starts producing values; a rejection makes adding the signal fail and disposes the sensor. */
  start(): void | Promise<void> {}

  /** sends a value to the bus (equal consecutive values are deduped there); clears a reported failure */
  protected emit(value: Value) {
    if (this.isDisposed) return
    this.failed = false
    this.output.emit(value)
  }

  /** reports that the sensor can't deliver values anymore, e.g. the entity it follows was deleted; the next emit() or recover() clears it */
  protected fail(message: string) {
    if (this.isDisposed) return
    this.failed = true
    this.output.fail(message)
  }

  /**
   * Clears a failure reported with fail() when the sensor works again but has no value to send
   * (an entity back as "unavailable"). Cheap to call often: it only tells the host after a fail().
   */
  protected recover() {
    if (this.isDisposed || !this.failed) return
    this.failed = false
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
}
