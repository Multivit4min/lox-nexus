import type { EventBus, TopicKinds } from "@lox-nexus/core"
import { Disposable } from "@lox-nexus/plugin-sdk"
import type { Logger } from "pino"
import type { SnapshotRepository } from "../db/repositories/SnapshotRepository.ts"

/**
 * Persists the last real value of every signal topic every few seconds and on shutdown, never per
 * change. Two-phase: values are confirmed on the bus only after the write succeeded, so a failed
 * write is retried with the next batch. Topics that aren't signals (status, discovered packets)
 * are confirmed without being stored, so they are never replayed at boot.
 */
export class SnapshotWriter extends Disposable {
  static readonly INTERVAL_MS = 5000

  constructor(
    private readonly bus: Pick<EventBus, "pendingSnapshot" | "confirmSnapshot">,
    private readonly signals: TopicKinds,
    private readonly repo: SnapshotRepository,
    private readonly log: Logger
  ) {
    super()
    this.every(SnapshotWriter.INTERVAL_MS, () => this.flush())
    this.onDispose(() => void this.flush())
  }

  /** @returns how many values were stored */
  flush(): number {
    const pending = this.bus.pendingSnapshot()
    if (pending.length === 0) return 0
    const persistent = pending.filter(entry => this.signals.kindOf(entry.topic) !== undefined)
    try {
      this.repo.save(persistent)
      this.bus.confirmSnapshot(pending)
      return persistent.length
    } catch (error) {
      this.log.error({ err: error, values: persistent.length }, "saving the value snapshot failed; retrying with the next batch")
      return 0
    }
  }
}
