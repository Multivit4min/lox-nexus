/** Thrown when the queue is full; the API answers 503 so clients retry later. */
export class BusyError extends Error {
  constructor() {
    super("the server is busy, try again in a moment")
  }
}

/**
 * Runs at most `max` tasks at once and queues up to `queue` more. Used for password hashing, which
 * costs 32 MiB and ~100 ms each: unbounded, a burst of logins could exhaust memory and CPU.
 * Waiters start in arrival order. Refusing early (BusyError) is deliberate: a queue that grows
 * without bound would only turn an attack into a slow outage.
 */
export class ConcurrencyLimit {
  private running = 0
  private readonly waiting: Array<() => void> = []

  /** @param max tasks that may run at once @param queue tasks that may wait beyond that */
  constructor(private readonly max: number, private readonly queue: number) {}

  /** @throws BusyError when `max` tasks run and `queue` more are waiting */
  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= this.max) {
      if (this.waiting.length >= this.queue) throw new BusyError()
      await new Promise<void>(resolve => this.waiting.push(resolve))
    }
    this.running++
    try {
      return await task()
    } finally {
      this.running--
      this.waiting.shift()?.()
    }
  }
}
