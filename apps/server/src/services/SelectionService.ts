import { EventEmitter } from "node:events"
import { SignalSelection, type SelectionMode, type SelectionTarget } from "@lox-nexus/core"
import type { SelectionRepository } from "../db/repositories/SelectionRepository.ts"
import { ErrorHandler } from "../http/ErrorHandler.ts"
import { HttpError } from "../http/HttpError.ts"

/**
 * Which signals each consumer takes ("history", or a watching plugin instance), built once from
 * the database and rebuilt when it changes; the bus asks for every message. A consumer without a
 * stored mode takes nothing ("selected" with no rules) until the user chooses. Emits `changed`
 * with the consumer after every change, so a watching plugin's feed can follow at once.
 */
export class SelectionService extends EventEmitter<{ changed: [consumer: string] }> {
  private readonly cache = new Map<string, SignalSelection>()

  constructor(private readonly repo: SelectionRepository) {
    super()
  }

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
    this.changed(consumer)
  }

  /** `include` null removes the rule; @throws SQLite constraint error for a target that doesn't exist */
  setRule(consumer: string, target: SelectionTarget, include: boolean | null) {
    this.repo.setRule(consumer, target, include)
    this.changed(consumer)
  }

  /**
   * Sets several rules at once (`include` null removes one), all or none.
   * @throws HttpError 400 when a target doesn't exist
   */
  setRules(consumer: string, rules: ReadonlyArray<{ target: SelectionTarget; include: boolean | null }>) {
    try {
      this.repo.setRules(consumer, rules)
    } catch (error) {
      if (ErrorHandler.isConstraint(error)) throw HttpError.badRequest("a rule names a signal, Miniserver or plugin instance that doesn't exist")
      throw error
    } finally {
      this.changed(consumer)
    }
  }

  /** a consumer that is gone (a deleted plugin instance): its mode and rules go too */
  forget(consumer: string) {
    this.repo.forget(consumer)
    this.changed(consumer)
  }

  /** rebuilds every selection on next use; after a deletion removed rules through foreign keys */
  invalidate() {
    const consumers = [...this.cache.keys()]
    this.cache.clear()
    for (const consumer of consumers) this.emit("changed", consumer)
  }

  private changed(consumer: string) {
    this.cache.delete(consumer)
    this.emit("changed", consumer)
  }
}
