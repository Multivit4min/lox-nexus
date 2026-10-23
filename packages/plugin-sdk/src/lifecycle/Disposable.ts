/** Cleanup callback registered with a Disposable. May be async; errors are collected, not swallowed. */
export type Teardown = () => void | Promise<void>

/** The minimal shape of something with a lifetime; lets own() accept objects that are not Disposable subclasses. */
export interface DisposableLike {
  dispose(): void | Promise<void>
}

// Node's EventEmitter types listeners with any[]; this keeps listen() compatible with it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener = (...args: any[]) => void

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
 */
export abstract class Disposable implements DisposableLike {
  /** the largest delay setTimeout/setInterval honour; Node turns anything longer into 1 ms */
  static readonly MAX_TIMER_MS = 2_147_483_647
  private readonly teardowns = new Set<Teardown>()
  private disposing: Promise<void> | undefined

  /** true from the moment dispose() starts, not when it finishes */
  get isDisposed() {
    return this.disposing !== undefined
  }

  /**
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
   * registers a teardown callback that runs on dispose()
   * @throws Error if already disposed
   */
  protected onDispose(teardown: Teardown) {
    if (this.isDisposed) throw new Error(`${this.constructor.name} is already disposed`)
    this.teardowns.add(teardown)
  }

  /** ties the lifetime of a child resource to this object; returns it so construction and registration fit in one expression */
  protected own<T extends DisposableLike>(resource: T): T {
    this.onDispose(() => resource.dispose())
    return resource
  }

  /**
   * runs fn every ms milliseconds until disposed or until the returned cancel function is called.
   * @throws RangeError unless 0 < ms <= MAX_TIMER_MS
   */
  protected every(ms: number, fn: () => void): () => void {
    if (!Number.isFinite(ms) || ms <= 0 || ms > Disposable.MAX_TIMER_MS) throw new RangeError(`interval must be between 1 and ${Disposable.MAX_TIMER_MS} ms, got ${ms}`)
    const timer = setInterval(fn, ms)
    const cancel = () => {
      clearInterval(timer)
      this.teardowns.delete(cancel)
    }
    this.onDispose(cancel)
    return cancel
  }

  /**
   * runs fn once after ms milliseconds unless disposed before; returns a cancel function.
   * Both firing and cancelling forget the teardown, so repeated use does not accumulate entries.
   * Delays beyond MAX_TIMER_MS are scheduled in steps, so they don't fire early.
   * @throws RangeError for negative or non-finite delays
   */
  protected after(ms: number, fn: () => void): () => void {
    if (!Number.isFinite(ms) || ms < 0) throw new RangeError(`delay must be a finite number >= 0, got ${ms}`)
    let timer: NodeJS.Timeout | undefined
    const cancel = () => {
      clearTimeout(timer)
      this.teardowns.delete(cancel)
    }
    const fire = () => {
      this.teardowns.delete(cancel)
      fn()
    }
    // long delays are re-measured against a fixed deadline at every step, so timer drift can't add up
    const deadline = Date.now() + ms
    const schedule = (remaining: number) => {
      const step = Math.min(remaining, Disposable.MAX_TIMER_MS)
      timer = setTimeout(() => (step < remaining ? schedule(Math.max(0, deadline - Date.now())) : fire()), step)
    }
    this.onDispose(cancel)
    schedule(ms)
    return cancel
  }

  /** subscribes to an emitter until disposed; the listener is removed again on dispose() */
  protected listen(emitter: Listenable, event: string | symbol, listener: Listener) {
    emitter.on(event, listener)
    this.onDispose(() => void emitter.off(event, listener))
  }
}
