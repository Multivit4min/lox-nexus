import { SystemClock, type Clock } from "./Clock.ts"

/** Cleanup callback registered with a Disposable. May be async; errors are collected, not swallowed. */
export type Teardown = () => void | Promise<void>

/** The minimal shape of something with a lifetime; lets own() accept objects that are not Disposable subclasses. */
export interface DisposableLike {
  dispose(): void | Promise<void>
}

/** An event listener as listen() takes it. Typed with any[] like Node's EventEmitter, so emitters fit. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Listener = (...args: any[]) => void

/** Structural subset of EventEmitter (and similar) needed by listen(). */
export interface Listenable {
  on(event: string | symbol, listener: Listener): unknown
  off(event: string | symbol, listener: Listener): unknown
}

/**
 * Base class for everything that has a lifetime.
 *
 * Resources registered through own(), every(), after() or listen() are
 * released in reverse registration order when dispose() is called, so a
 * subclass never has to remember to clean up after itself. The registration helpers are protected
 * on purpose: only the owner decides what lives and dies with it.
 *
 * Registering anything after dispose() throws, so a late callback cannot leak a timer into a
 * dead object.
 *
 * Plugins, sensors and actuators are Disposables; the runtime calls their dispose() when a signal
 * is removed or edited and when the instance stops, so plugin code rarely calls it itself. A
 * class you own() should extend Disposable too (or implement DisposableLike) and register its own
 * timers and listeners the same way:
 *
 * ```ts
 * class Poller extends Disposable {
 *   start() { this.every(5000, () => void this.poll()) }
 * }
 * // in the plugin: readonly poller = this.own(new Poller())   (call poller.start() from start())
 * ```
 *
 * A callback given to every(), after() or listen() that throws is an uncaught exception, which
 * ends the worker (the host restarts it); catch errors inside it, and report them with the
 * plugin's `log` or `status`. A callback that returns a rejected promise goes to
 * Plugin.unhandledRejection().
 */
export abstract class Disposable implements DisposableLike {
  /** the largest delay setTimeout/setInterval honour; Node turns anything longer into 1 ms */
  static readonly MAX_TIMER_MS = 2_147_483_647
  private readonly teardowns = new Set<Teardown>()
  private disposing: Promise<void> | undefined
  // ES-private, so subclasses can keep their own `clock` fields
  #clock: Clock | undefined
  // the first Disposable that own()ed this one; the clock is looked up through it when needed
  #owner: Disposable | undefined

  /** true from the moment dispose() starts, not when it finishes */
  get isDisposed() {
    return this.disposing !== undefined
  }

  /**
   * Releases everything registered with this object. Plugin code seldom needs it: the runtime
   * disposes plugins, sensors and actuators, and own() disposes children. Call it yourself for an
   * object you created without own(), or to end a child early.
   *
   * Runs all teardowns in reverse registration order and keeps going when one fails. Idempotent:
   * every call returns the same promise, so a second caller also waits for async teardowns.
   * @throws AggregateError collecting every teardown error, after all teardowns have run
   */
  dispose(): Promise<void> {
    this.disposing ??= this.runTeardowns()
    return this.disposing
  }

  private async runTeardowns() {
    const errors: unknown[] = []
    const pending = [...this.teardowns].reverse()
    this.teardowns.clear()
    for (const teardown of pending) {
      try {
        await teardown()
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, `${this.constructor.name} failed to dispose cleanly`)
  }

  /**
   * Registers a callback that runs on dispose(), for cleanup the helpers don't cover (closing a
   * socket, flushing a buffer). Async callbacks are awaited one after the other, last registered
   * first, so a flush can use what was registered before it. Keep the total under the five seconds
   * a stop has.
   * @throws Error if already disposed
   */
  protected onDispose(teardown: Teardown) {
    if (this.isDisposed) throw new Error(`${this.constructor.name} is already disposed`)
    this.teardowns.add(teardown)
  }

  /**
   * Sets the clock for every() and after() calls from now on, unless one is set already; without
   * one they run on the system clock. Timers started before keep the clock they started on.
   * Plugin, Sensor and Actuator set it from the plugin's context.
   */
  protected useClock(clock: Clock | undefined) {
    this.#clock ??= clock
  }

  /**
   * The clock this object runs on: every() and after() use it, and a Disposable that isn't a
   * plugin, sensor or actuator reads the time from it (`this.currentClock().now()`).
   */
  protected currentClock(): Clock {
    return this.#clock ?? this.#owner?.currentClock() ?? SystemClock.instance
  }

  /**
   * ties the lifetime of a child resource to this object; returns it so construction and
   * registration fit in one expression. A Disposable child without a clock of its own runs on
   * this one's, looked up when a timer starts, so a chain of owners (plugin → client → poller)
   * shares the plugin's clock. Timers a child starts in its constructor, before it is owned, run
   * on the system clock.
   */
  protected own<T extends DisposableLike>(resource: T): T {
    this.onDispose(() => resource.dispose())
    if (resource instanceof Disposable && (resource as Disposable) !== this) resource.#owner ??= this
    return resource
  }

  /**
   * runs fn every ms milliseconds until disposed or until the returned cancel function is called.
   * The first run is after ms, not at once; call fn yourself first if you want an immediate run.
   * Runs are not queued: a slow async fn can overlap its next run, so guard it yourself if needed.
   * @throws RangeError unless 0 < ms <= MAX_TIMER_MS
   */
  protected every(ms: number, fn: () => void): () => void {
    if (!Number.isFinite(ms) || ms <= 0 || ms > Disposable.MAX_TIMER_MS) throw new RangeError(`interval must be between 1 and ${Disposable.MAX_TIMER_MS} ms, got ${ms}`)
    const clock = this.currentClock()
    const timer = clock.setInterval(fn, ms)
    const cancel = () => {
      clock.clearInterval(timer)
      this.teardowns.delete(cancel)
    }
    this.onDispose(cancel)
    return cancel
  }

  /**
   * runs fn once after ms milliseconds unless disposed before; returns a cancel function.
   * Both firing and cancelling forget the teardown, so repeated use does not accumulate entries.
   * Delays beyond MAX_TIMER_MS are scheduled in steps, so they don't fire early.
   *
   * The delay counts elapsed time, not wall-clock time: a clock step (an NTP sync after boot)
   * is not noticed. For a deadline given as a wall-clock time, wait in shorter slices and
   * re-check the time each time.
   * @throws RangeError for negative or non-finite delays
   */
  protected after(ms: number, fn: () => void): () => void {
    if (!Number.isFinite(ms) || ms < 0) throw new RangeError(`delay must be a finite number >= 0, got ${ms}`)
    const clock = this.currentClock()
    let timer: unknown
    const cancel = () => {
      clock.clearTimeout(timer)
      this.teardowns.delete(cancel)
    }
    const fire = () => {
      this.teardowns.delete(cancel)
      fn()
    }
    // long delays are re-measured against a fixed deadline at every step, so timer drift can't add up
    const deadline = clock.now() + ms
    const schedule = (remaining: number) => {
      const step = Math.min(remaining, Disposable.MAX_TIMER_MS)
      timer = clock.setTimeout(() => (step < remaining ? schedule(Math.max(0, deadline - clock.now())) : fire()), step)
    }
    this.onDispose(cancel)
    schedule(ms)
    return cancel
  }

  /**
   * Subscribes `listener` to `event` of an EventEmitter (or anything with on/off) and removes it
   * again on dispose(), so a long-lived emitter such as the plugin's poller does not keep a
   * disposed sensor alive. Prefer it to calling `emitter.on` yourself.
   */
  protected listen(emitter: Listenable, event: string | symbol, listener: Listener) {
    emitter.on(event, listener)
    this.onDispose(() => void emitter.off(event, listener))
  }
}
