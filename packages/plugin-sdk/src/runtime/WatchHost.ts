import type { Plugin } from "../plugin/Plugin.ts"
import type { WatchView } from "../plugin/PluginContext.ts"
import type { WatchedSignal, WatchedValue } from "../wire/WatchShapes.ts"
import type { WorkerMessage } from "../wire/WorkerMessages.ts"

/**
 * The worker side of watching: keeps the watched signals for `plugin.watch`, and hands value
 * batches to `plugin.watched()` one after the other, acknowledging each when it is done (also when
 * it threw, so a bug can't stop the feed). The host sends the next batches only after acks.
 */
export class WatchHost implements WatchView {
  private readonly map = new Map<string, WatchedSignal>()
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly send: (message: WorkerMessage) => void, private readonly report: (error: unknown) => void) {}

  signals() {
    return [...this.map.values()]
  }

  signal(id: string) {
    return this.map.get(id)
  }

  /**
   * Replaces the list once the batches sent before it are handled, so a batch always meets the list
   * it was sent with, and the plugin's callbacks never overlap; then tells the plugin.
   */
  setSignals(signals: readonly WatchedSignal[], plugin: () => Plugin | undefined) {
    return this.enqueue(async () => {
      this.map.clear()
      for (const signal of signals) this.map.set(signal.id, signal)
      await this.guard(() => plugin()?.watchChanged())
    })
  }

  /** queues a batch behind what came before; without a plugin (not started, stopped) it is only acknowledged */
  values(seq: number, values: readonly WatchedValue[], dropped: number, plugin: () => Plugin | undefined) {
    return this.enqueue(async () => {
      try {
        const current = plugin()
        if (current && !current.isDisposed) await this.guard(() => current.watched?.(values, dropped))
      } finally {
        this.send({ type: "watch.ack", seq })
      }
    })
  }

  /** settles when everything queued is handled, e.g. before the plugin is disposed */
  idle() {
    return this.queue
  }

  // a failure must not reject the chain, or every later message would be stuck behind it
  private enqueue(work: () => Promise<void>) {
    this.queue = this.queue.then(work).catch(error => this.report(error))
    return this.queue
  }

  private async guard(work: () => unknown) {
    try {
      await work()
    } catch (error) {
      this.report(error)
    }
  }
}
