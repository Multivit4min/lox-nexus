import { reactive } from "vue"
import type { HistoryApi } from "../api/HistoryApi.ts"

/**
 * Which signals the history's selection takes, for the record marks and buttons in signal lists.
 * Lists load it when they mount; changes made here reload it. Only the latest answer applies, so a
 * slow earlier load can't bring back what a later change replaced.
 */
export class RecordedSignals {
  private readonly ids = reactive(new Set<string>())
  private requests = 0

  constructor(private readonly api: HistoryApi) {}

  /** a plain read; call load() to fill it */
  has(id: string) {
    return this.ids.has(id)
  }

  /** a failure keeps what was there; the next list or change loads again */
  async load() {
    const request = ++this.requests
    const ids = await this.api.recorded().catch(() => undefined)
    if (!ids || request !== this.requests) return
    this.ids.clear()
    for (const id of ids) this.ids.add(id)
  }

  /**
   * Records these signals (a rule each), or stops recording them: first by removing their rules,
   * which is enough when nothing else takes them; a signal still taken (by "all", or a rule on its
   * Miniserver or plugin instance) then gets a rule that leaves it out.
   */
  async set(ids: readonly string[], record: boolean) {
    if (ids.length === 0) return
    await this.api.setRules(ids.map(signalId => ({ target: { signalId }, include: record ? true : null })))
    await this.load()
    const still = record ? [] : ids.filter(id => this.ids.has(id))
    if (still.length === 0) return
    await this.api.setRules(still.map(signalId => ({ target: { signalId }, include: false })))
    await this.load()
  }
}
