import { Topic, type EventBus } from "@lox-nexus/core"
import type { SnapshotRepository } from "../db/repositories/SnapshotRepository.ts"

/**
 * Removes what a deleted signal or Miniserver leaves on the bus: forces are released (which also
 * deletes them from the forces table), retained values are forgotten, snapshot rows deleted.
 * Without this a re-added packet id would inherit an old force, and stale values would come
 * back at every boot.
 */
export class TopicCleanup {
  constructor(
    private readonly bus: Pick<EventBus, "activeForces" | "release" | "forget">,
    private readonly snapshot: SnapshotRepository
  ) {}

  /** @param pattern a topic or a pattern such as loxone/haus/# */
  forget(pattern: string, by: string) {
    for (const force of this.bus.activeForces()) {
      if (Topic.matches(pattern, force.topic)) this.bus.release(force.topic, by, "deleted")
    }
    for (const topic of this.bus.forget(pattern)) this.snapshot.delete(topic)
  }
}
