/**
 * Hands this process's unhandled promise rejections to a handler, as PluginEntry does in a worker,
 * until restore(). node:test's own listener would report them as test failures, so it is set aside
 * meanwhile and put back afterwards. One forwarder at a time: a second one would take over, and
 * restoring out of order would lose the runner's listener.
 */
export class RejectionForwarder {
  private readonly runner = process.listeners("unhandledRejection")
  private readonly forward: (reason: unknown) => void

  constructor(handler: (reason: unknown) => void) {
    this.forward = reason => handler(reason)
    process.removeAllListeners("unhandledRejection")
    process.on("unhandledRejection", this.forward)
  }

  /** waits a few turns for late rejections (a stop often causes some), then puts node:test's listener back */
  async restore() {
    try {
      for (let turn = 0; turn < 5; turn++) await new Promise<void>(resolve => setImmediate(resolve))
    } finally {
      process.off("unhandledRejection", this.forward)
      for (const listener of this.runner) process.on("unhandledRejection", listener)
    }
  }
}
