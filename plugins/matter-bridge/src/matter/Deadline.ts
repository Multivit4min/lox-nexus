import type { Clock } from "@lox-nexus/plugin-sdk"

/**
 * Waits for work, but not longer than a deadline, on the plugin's clock. For teardown, where the
 * plugin's own timers (after()) are no longer available; the timer is always cleared again.
 */
export class Deadline {
  /** resolves true when `work` settled in time, false when the deadline came first; `work` keeps running */
  static async within(work: Promise<unknown>, ms: number, clock: Clock): Promise<boolean> {
    let handle: unknown
    const deadline = new Promise<false>(resolve => {
      handle = clock.setTimeout(() => resolve(false), ms)
    })
    try {
      return await Promise.race([work.then(() => true, () => true), deadline])
    } finally {
      clock.clearTimeout(handle as never)
    }
  }
}
