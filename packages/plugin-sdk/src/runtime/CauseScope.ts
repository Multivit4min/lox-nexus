import { AsyncLocalStorage } from "node:async_hooks"

/**
 * Remembers which bus message is being handled, across awaits. While an actuator runs, anything
 * the plugin emits or logs carries that message's id, so the inspector can show the effect under
 * its cause without plugin code passing anything along.
 */
export class CauseScope {
  private static readonly storage = new AsyncLocalStorage<string>()

  /** runs `work` with `causeId` as the current cause (none when undefined) */
  static run<T>(causeId: string | undefined, work: () => T): T {
    return causeId === undefined ? work() : CauseScope.storage.run(causeId, work)
  }

  /** the id of the bus message being handled, if any */
  static current(): string | undefined {
    return CauseScope.storage.getStore()
  }
}
