export type Teardown = () => void | Promise<void>

export interface DisposableLike {
  dispose(): void | Promise<void>
}

// Node's EventEmitter types listeners with any[]; this keeps listen() compatible with it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener = (...args: any[]) => void

export interface Listenable {
  on(event: string | symbol, listener: Listener): unknown
  off(event: string | symbol, listener: Listener): unknown
}

/**
 * Base class for everything that has a lifetime.
 *
 * Resources registered through own(), every(), after() or listen() are
 * released in reverse registration order when dispose() is called, so a
 * subclass never has to remember to clean up after itself.
 */
export abstract class Disposable implements DisposableLike {
  private readonly teardowns: Teardown[] = []
  private disposed = false

  get isDisposed() {
    return this.disposed
  }

  async dispose() {
    if (this.disposed) return
    this.disposed = true
    const errors: unknown[] = []
    for (const teardown of this.teardowns.splice(0).reverse()) {
      try {
        await teardown()
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, `${this.constructor.name} failed to dispose cleanly`)
  }

  /** registers a teardown callback that runs on dispose() */
  protected onDispose(teardown: Teardown) {
    if (this.disposed) throw new Error(`${this.constructor.name} is already disposed`)
    this.teardowns.push(teardown)
  }

  /** ties the lifetime of a child resource to this object */
  protected own<T extends DisposableLike>(resource: T): T {
    this.onDispose(() => resource.dispose())
    return resource
  }

  /** runs fn every ms milliseconds until disposed */
  protected every(ms: number, fn: () => void) {
    const timer = setInterval(fn, ms)
    this.onDispose(() => clearInterval(timer))
  }

  /** runs fn once after ms milliseconds unless disposed before */
  protected after(ms: number, fn: () => void) {
    const timer = setTimeout(fn, ms)
    this.onDispose(() => clearTimeout(timer))
  }

  /** subscribes to an emitter until disposed */
  protected listen(emitter: Listenable, event: string | symbol, listener: Listener) {
    emitter.on(event, listener)
    this.onDispose(() => void emitter.off(event, listener))
  }
}
