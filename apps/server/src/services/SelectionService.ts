import { SignalSelection, type SelectionMode, type SelectionTarget } from "@lox-nexus/core"
import type { SelectionRepository } from "../db/repositories/SelectionRepository.ts"

/**
 * Which signals each consumer takes ("history", or a watching plugin instance), built once from
 * the database and rebuilt when it changes; the bus asks for every message. A consumer without a
 * stored mode takes nothing ("selected" with no rules) until the user chooses.
 */
export class SelectionService {
  private readonly cache = new Map<string, SignalSelection>()

  constructor(private readonly repo: SelectionRepository) {}

  of(consumer: string): SignalSelection {
    let selection = this.cache.get(consumer)
    if (!selection) {
      selection = new SignalSelection(this.repo.mode(consumer) ?? "selected", this.repo.rules(consumer))
      this.cache.set(consumer, selection)
    }
    return selection
  }

  setMode(consumer: string, mode: SelectionMode) {
    this.repo.setMode(consumer, mode)
    this.cache.delete(consumer)
  }

  /** `include` null removes the rule; @throws SQLite constraint error for a target that doesn't exist */
  setRule(consumer: string, target: SelectionTarget, include: boolean | null) {
    this.repo.setRule(consumer, target, include)
    this.cache.delete(consumer)
  }

  /** rebuilds every selection on next use; after a deletion removed rules through foreign keys */
  invalidate() {
    this.cache.clear()
  }
}
