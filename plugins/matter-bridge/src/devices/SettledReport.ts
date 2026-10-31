/**
 * Collects what one controller action changed and reports it once, after the changes of this turn
 * have settled: an app's "warm white at 30 %" changes several attributes one after the other, and
 * the level may follow on/off a moment later (matter.js's on-level coupling).
 */
export class SettledReport<K extends string> {
  private pending: Set<K> | undefined

  /**
   * @param wait resolves after the current turn (the plugin's clock)
   * @param report gets what changed; a change without a kind only asks for a report
   * @param warn a failed report goes to the instance log (the device may have been removed meanwhile)
   */
  constructor(
    private readonly wait: () => Promise<void>,
    private readonly report: (changed: ReadonlySet<K>) => void,
    private readonly warn: (message: string) => void
  ) {}

  changed(kind?: K) {
    const flush = !this.pending
    this.pending ??= new Set()
    if (kind) this.pending.add(kind)
    if (!flush) return
    this.wait()
      .then(() => this.flush())
      .catch((error: unknown) => this.warn(`could not report a change from a controller: ${error instanceof Error ? error.message : String(error)}`))
  }

  private flush() {
    const changed = this.pending ?? new Set<K>()
    this.pending = undefined
    this.report(changed)
  }
}
