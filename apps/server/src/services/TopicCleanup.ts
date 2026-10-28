import { Topic, type EventBus, type ForceRecord, type SnapshotEntry } from "@lox-nexus/core"
import type { SnapshotRepository } from "../db/repositories/SnapshotRepository.ts"

/** Forces and last real values taken before topics are removed, to bring back once they exist again. */
export interface KeptState {
  forces: ForceRecord[]
  values: SnapshotEntry[]
}

/**
 * Removes what a deleted signal or Miniserver leaves on the bus: forces are released (which also
 * deletes them from the forces table), retained values are forgotten, snapshot rows deleted.
 * Without this a re-added packet id would inherit an old force, and stale values would come
 * back at every boot. move() does the opposite for a signal that stays but changes topic.
 */
export class TopicCleanup {
  constructor(
    private readonly bus: Pick<EventBus, "activeForces" | "release" | "forget" | "force" | "real" | "restoreSnapshot" | "currentMatching">,
    private readonly snapshot: SnapshotRepository
  ) {}

  /** @param pattern a topic or a pattern such as loxone/haus/# */
  forget(pattern: string, by: string) {
    for (const force of this.bus.activeForces()) {
      if (Topic.matches(pattern, force.topic)) this.bus.release(force.topic, by, "deleted")
    }
    for (const topic of this.bus.forget(pattern)) this.snapshot.delete(topic)
  }

  /**
   * For a signal whose topic changed: a force moves to the new topic (one whose expiry has passed
   * is dropped), then the last real value follows as a restored value, and nothing is left on the
   * old topic. The force comes first (as at boot), so under a force the moved value arrives
   * shadowed and nothing but the forced value reaches subscribers. Without a force the value is
   * delivered like a snapshot at boot: wires ignore it unless they sync on start, and an output
   * sends it to the Miniserver under its new packet id, as it would after a restart.
   */
  move(from: string, to: string, by: string) {
    const force = this.bus.activeForces().find(entry => entry.topic === from)
    const real = this.bus.real(from)
    this.forget(from, by)
    if (force) this.reapply(force, to, by)
    if (!real?.value) return
    const entry = { topic: to, value: real.value, ts: real.ts }
    this.bus.restoreSnapshot([entry])
    this.snapshot.save([entry])
  }

  /** the forces and last real values on topics matching `pattern`, before they are removed and made again (a config import) */
  keep(pattern: string): KeptState {
    const forces = this.bus.activeForces().filter(force => Topic.matches(pattern, force.topic))
    const values = this.bus.currentMatching(pattern).flatMap(({ topic }) => {
      const real = this.bus.real(topic)
      return real?.value ? [{ topic, value: real.value, ts: real.ts }] : []
    })
    return { forces, values }
  }

  /**
   * Brings back what keep() took, on the topics that exist again; forces first, as at boot, so a
   * value under a force arrives shadowed. A value comes back like a snapshot at boot.
   */
  bringBack(kept: KeptState, exists: (topic: string) => boolean, by: string) {
    for (const force of kept.forces) if (exists(force.topic)) this.reapply(force, force.topic, by)
    const values = kept.values.filter(entry => exists(entry.topic))
    if (values.length === 0) return
    this.bus.restoreSnapshot(values)
    this.snapshot.save(values)
  }

  private reapply(force: ForceRecord, topic: string, by: string) {
    const { value, reason, until } = force
    try {
      this.bus.force(topic, value, { by: force.by, ...(reason ? { reason } : {}), ...(until ? { until } : {}) }, { kind: "user", id: by })
    } catch (error) {
      // the bus refuses an expiry in the past; such a force would have been released anyway
      if (!(error instanceof RangeError)) throw error
    }
  }
}
