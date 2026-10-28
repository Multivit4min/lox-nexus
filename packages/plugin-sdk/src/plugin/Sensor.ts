import type { z } from "zod"
import { Disposable } from "../lifecycle/Disposable.ts"
import type { Value, ValueType } from "../values/Value.ts"
import type { Plugin } from "./Plugin.ts"
import type { SignalInfo } from "./SignalInfo.ts"

/** Where a sensor's values go; the runtime forwards them to the bus. */
export interface SensorOutput {
  /** sends a value to the bus, tagged with the cause of the work that is running (see Actuator) */
  emit(value: Value): void
  /** the sensor stopped working after it started; shown on the signal until it emits again */
  fail(message: string): void
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
  }

  /** Starts producing values; a rejection makes adding the signal fail and disposes the sensor. */
  start(): void | Promise<void> {}

  /** sends a value to the bus; equal consecutive values are deduped there */
  protected emit(value: Value) {
    if (!this.isDisposed) this.output.emit(value)
  }

  /** reports that the sensor can't deliver values anymore, e.g. the entity it follows was deleted; the next emit() clears it */
  protected fail(message: string) {
    if (!this.isDisposed) this.output.fail(message)
  }
}

/** The static side of a sensor class, as the runtime sees it. */
export type SensorClass = (new (plugin: never, params: never, output: SensorOutput, signal?: SignalInfo) => Sensor<Plugin, unknown>) & {
  /** unique within the plugin; part of the stored signal, so don't rename it */
  readonly id: string
  /** shown in UIs; default: the id */
  readonly label?: string
  /** default: no params (an empty object) */
  readonly params?: z.ZodType
  /** what emit() sends, so wires can convert; default "any" (it varies) */
  readonly valueType?: ValueType | "any"
}
