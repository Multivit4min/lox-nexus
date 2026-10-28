/**
 * Hands this process's unhandled promise rejections to a handler, as PluginEntry does in a worker,
 * until restore(). node:test's own listener would report them as test failures, so it is set aside
 * meanwhile and put back afterwards. One forwarder at a time, because restoring two out of order
 * would lose the runner's listener: a second one throws.
 */
export class RejectionForwarder {
  private static active: RejectionForwarder | undefined
  private readonly runner = process.listeners("unhandledRejection")
  private readonly forward: (reason: unknown) => void

  /** @throws Error while another forwarder is active */
  constructor(handler: (reason: unknown) => void) {
    if (RejectionForwarder.active) throw new Error("another PluginTestHost forwards rejections already; stop it first")
    RejectionForwarder.active = this
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
      if (RejectionForwarder.active === this) RejectionForwarder.active = undefined
    }
  }
}
