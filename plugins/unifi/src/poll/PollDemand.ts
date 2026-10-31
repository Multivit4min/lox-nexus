/** what a poll reads only while a signal needs it */
export type DemandKind = "statistics" | "ports"

/**
 * Which per-device reads the signals need: latest statistics, and port details of devices the
 * poll doesn't read anyway. A poll asks only for these, so the console isn't asked for every
 * device's statistics when no signal shows them. Counted, so two signals of one device need it once.
 */
export class PollDemand {
  private readonly counts = new Map<DemandKind, Map<string, number>>()

  /** registers a need for a device (its normalized MAC); the returned function releases it, once */
  need(kind: DemandKind, target: string): () => void {
    const targets = this.counts.get(kind) ?? new Map<string, number>()
    this.counts.set(kind, targets)
    targets.set(target, (targets.get(target) ?? 0) + 1)
    let released = false
    return () => {
      if (released) return
      released = true
      const left = (targets.get(target) ?? 1) - 1
      if (left > 0) targets.set(target, left)
      else targets.delete(target)
    }
  }

  /** the devices (MAC addresses) with a need of this kind */
  targets(kind: DemandKind): Set<string> {
    return new Set(this.counts.get(kind)?.keys() ?? [])
  }
}
