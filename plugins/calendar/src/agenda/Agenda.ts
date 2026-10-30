import type { Listenable } from "@lox-nexus/plugin-sdk"
import { FilterParams } from "../filter/FilterParams.ts"
import type { Occurrence } from "../ics/Occurrence.ts"
import type { Dismissals } from "./Dismissals.ts"

/**
 * The occurrences the sensors work on: the last calendar read successfully, minus what was
 * dismissed. Emits "changed" after every successful read, dismissal and restore, so sensors
 * re-evaluate. Held in memory only; a calendar can be megabytes, too much for the store.
 */
export class Agenda implements Listenable {
  /** every occurrence of the last good read, sorted by start, dismissed ones included */
  all: Occurrence[] = []
  /** false until the first successful read; sensors send nothing before that */
  loaded = false
  private visibleCache: Occurrence[] | undefined
  private readonly listeners = new Set<() => void>()

  /** @param listenerFailed gets what a "changed" listener threw; the other listeners still run */
  constructor(private readonly dismissals: Dismissals, private readonly listenerFailed: (error: unknown) => void) {}

  /** the occurrences that aren't dismissed, sorted by start */
  get visible() {
    this.visibleCache ??= this.all.filter(occurrence => !this.dismissals.has(occurrence))
    return this.visibleCache
  }

  get dismissedCount() {
    return this.dismissals.size
  }

  isDismissed(occurrence: Occurrence) {
    return this.dismissals.has(occurrence)
  }

  /** takes a fresh read of the calendar */
  replace(occurrences: Occurrence[], now: number) {
    this.all = occurrences
    this.loaded = true
    this.dismissals.prune(now)
    this.changed()
  }

  /**
   * Hides occurrences from every sensor of the instance. A dismissal is kept until a day after
   * the occurrence ends, the longest lag a signal may have, so no sensor shows it again.
   */
  dismiss(occurrences: Occurrence[], now: number) {
    this.dismissals.prune(now)
    const keepMs = FilterParams.MAX_LAG_MINUTES * 60_000
    const added = this.dismissals.add(occurrences, occurrence => occurrence.end.getTime() + keepMs)
    this.visibleCache = undefined
    if (added) this.changed()
    return added
  }

  /** the occurrence with this key (UID plus start) of the last good read */
  find(key: string) {
    return this.all.find(occurrence => occurrence.key === key)
  }

  /** shows a dismissed occurrence again; @returns whether it was dismissed */
  restore(key: string) {
    const removed = this.dismissals.remove(key)
    if (removed) this.changed()
    return removed
  }

  /** only "changed" exists; this makes the agenda usable with Disposable.listen() */
  on(_event: "changed", listener: () => void) {
    this.listeners.add(listener)
    return this
  }

  off(_event: "changed", listener: () => void) {
    this.listeners.delete(listener)
    return this
  }

  private changed() {
    this.visibleCache = undefined
    // one sensor's failure must not keep the others (or the read that triggered this) from finishing
    for (const listener of [...this.listeners]) {
      try {
        listener()
      } catch (error) {
        this.listenerFailed(error)
      }
    }
  }
}
