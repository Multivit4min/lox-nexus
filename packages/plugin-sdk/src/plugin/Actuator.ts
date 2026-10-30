import type { z } from "zod"
import { Disposable } from "../lifecycle/Disposable.ts"
import { SignalStatus } from "../runtime/SignalStatus.ts"
import type { Value, ValueType } from "../values/Value.ts"
import type { Plugin } from "./Plugin.ts"
import type { SignalInfo } from "./SignalInfo.ts"

/**
 * How commands that arrive while one is running are handled (set with the static `concurrency`):
 * - "queue": each runs, in order
 * - "latest": only the newest waiting command runs (a dimmer dragged across the range sends
 *   many values; only the last one matters)
 */
export type ActuatorConcurrency = "queue" | "latest"

/**
 * A command going to the device. Each configured actuator is one instance. run() is called with
 * the value converted to `accepts`; its outcome becomes a `result` message on the bus. The class
 * declares itself with static fields (see ActuatorClass; only `id` is required).
 *
 * Like a sensor, an actuator is created when its signal is added, disposed when it is removed or
 * the plugin stops, and recreated when its params are edited. Right after a (re)start the host may
 * call run() with a value the user forced earlier, so run() must cope with being called as soon
 * as start() has resolved.
 *
 * ```ts
 * export class SwitchActuator extends Actuator<MyPlugin, { id: string }, ValueOf<"boolean">> {
 *   static readonly id = "switch"
 *   static readonly params = z.object({ id: z.string() })
 *   static readonly accepts = "boolean"
 *   async run(value: ValueOf<"boolean">) { await this.plugin.api.set(this.params.id, value.value) }
 * }
 * ```
 */
export abstract class Actuator<P extends Plugin = Plugin, Params = unknown, V extends Value = Value> extends Disposable {
  /**
   * `params` are validated against the static `params` schema before construction. `signal` names
   * the configured signal this actuator is (for panels and log lines); a subclass that declares its
   * own constructor must pass it on to super().
   */
  constructor(readonly plugin: P, readonly params: Params, readonly signal: SignalInfo = { id: "", label: "" }) {
    super()
    // tests may build an actuator without a plugin
    this.useClock(plugin?.clock)
  }

  /** the plugin's clock: `this.clock.now()` instead of `Date.now()`; every() and after() run on it */
  get clock() {
    return this.plugin.clock
  }

  /**
   * Optional setup, called once after construction and before the first run(); the host waits for
   * it (at most 30 seconds). A rejection makes adding the signal fail and disposes the actuator.
   */
  start(): void | Promise<void> {}

  /**
   * Performs the command; throwing (or rejecting) reports a failed result. Emits and logs made
   * while it runs carry the command's cause id, including those from async work started here
   * (promises, timers, listeners created inside run()), so the inspector shows them as its effect.
   * Commands are serialized per `concurrency`; run() never overlaps itself. Put the real work
   * in here and await it: the result (and its duration) is reported when the promise settles. The
   * host marks a command as failed after 30 seconds without an answer, but cannot stop run().
   * Throw an Error with a message a user can read; it is shown as the failure reason.
   */
  abstract run(value: V): void | Promise<void>

  // the failure still showing: recover() only tells the host when there is one, and the same fail() isn't sent twice.
  // ES-private, so a subclass's own `failed` can't collide with it
  #failedWith: string | undefined

  /**
   * Reports that the actuator can't work at the moment, e.g. the device it controls was removed;
   * the message shows on the signal and the instance's error topic until recover(). Commands still
   * reach run(), which should refuse them with a readable error while the cause lasts. For an
   * outage of the whole device use `plugin.status.set("degraded", …)` instead. Repeating the same
   * message sends nothing. Works from start() on, not in the constructor.
   */
  protected fail(message: string) {
    if (this.isDisposed || message === this.#failedWith) return
    this.#failedWith = message
    SignalStatus.of(this)?.fail(message)
  }

  /** Clears a failure reported with fail(). Cheap to call often: it only tells the host after a fail(). */
  protected recover() {
    if (this.isDisposed || this.#failedWith === undefined) return
    this.#failedWith = undefined
    SignalStatus.of(this)?.recover()
  }
}

/** The static side of an actuator class, as the runtime sees it. */
export type ActuatorClass = (new (plugin: never, params: never, signal?: SignalInfo) => Actuator<Plugin, unknown, never>) & {
  /** unique within the plugin; part of the stored signal, so don't rename it */
  readonly id: string
  /** shown in UIs; default: the id */
  readonly label?: string
  /** one sentence for UIs: what it does, e.g. "Dims a light; 0 % turns it off" */
  readonly description?: string
  /** default: no params (an empty object) */
  readonly params?: z.ZodType
  /** the value type run() expects; wires convert to it. Default "any": values pass unchanged */
  readonly accepts?: ValueType | "any"
  /** default "queue" */
  readonly concurrency?: ActuatorConcurrency
  /** the unit new signals of it show their values in, e.g. "%" (up to 16 characters); the user can change it */
  readonly unit?: string
  /** the decimals new signals of it round their values to for display (0-6); the user can change it */
  readonly decimals?: number
}
