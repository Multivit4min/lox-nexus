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
  private readonly teardowns = new Set<Teardown>()
  private disposed = false

  /** true from the moment dispose() starts, not when it finishes */
  get isDisposed() {
    return this.disposed
  }

  /**
   * Runs all teardowns in reverse registration order and keeps going when one fails. Idempotent:
   * a second call returns immediately, even while the first is still awaiting async teardowns.
   * @throws AggregateError collecting every teardown error, after all teardowns have run
   */
  async dispose() {
    if (this.disposed) return
    this.disposed = true
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
    if (this.disposed) throw new Error(`${this.constructor.name} is already disposed`)
    this.teardowns.add(teardown)
  }

  /** ties the lifetime of a child resource to this object; returns it so construction and registration fit in one expression */
  protected own<T extends DisposableLike>(resource: T): T {
    this.onDispose(() => resource.dispose())
    return resource
  }

  /** runs fn every ms milliseconds until disposed. There is no cancel; use after() for cancellable one-shots. */
  protected every(ms: number, fn: () => void) {
    const timer = setInterval(fn, ms)
    this.onDispose(() => clearInterval(timer))
  }

  /**
   * runs fn once after ms milliseconds unless disposed before; returns a cancel function.
   * Both firing and cancelling forget the teardown, so repeated use does not accumulate entries.
   * Node clamps delays above ~24.8 days (2^31-1 ms) to 1 ms; callers with longer delays must chunk them.
   */
  protected after(ms: number, fn: () => void): () => void {
    const cancel = () => {
      clearTimeout(timer)
      this.teardowns.delete(cancel)
    }
    const timer = setTimeout(() => {
      this.teardowns.delete(cancel)
      fn()
    }, ms)
    this.onDispose(cancel)
    return cancel
  }

  /** subscribes to an emitter until disposed; the listener is removed again on dispose() */
  protected listen(emitter: Listenable, event: string | symbol, listener: Listener) {
    emitter.on(event, listener)
    this.onDispose(() => void emitter.off(event, listener))
  }
}
