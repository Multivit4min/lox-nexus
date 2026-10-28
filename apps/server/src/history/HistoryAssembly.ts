import { HistoryRecorder, HistoryRetention, SelectedValues, SignalSelection, type Clock, type EventBus, type Signal, type SignalRegistry } from "@lox-nexus/core"
import { Disposable } from "@lox-nexus/plugin-sdk"
import type { Logger } from "pino"
import { HistoryDatabase } from "../db/history/HistoryDatabase.ts"
import { HistoryRepository } from "../db/history/HistoryRepository.ts"
import type { SettingsRepository } from "../db/repositories/SettingsRepository.ts"
import type { SelectionService } from "../services/SelectionService.ts"
import { HistorySettingsStore } from "./HistorySettingsStore.ts"

/** What the history needs from the app. */
export interface HistoryDeps {
  bus: Pick<EventBus, "subscribe">
  signals: Pick<SignalRegistry, "atTopic" | "on" | "off">
  settings: SettingsRepository
  /** whether a signal is in the configuration; history of one that isn't goes after a grace period */
  signalExists: (signalId: string) => boolean
  selections: Pick<SelectionService, "of">
  clock: Clock
  log: Logger
}

/**
 * The value history: its own database file, the recorder fed with the selected signals' values,
 * and the retention. Built by NexusApp before the Miniservers and plugins start, so their first
 * values are recorded; disposed after them, so the last ones are written before the file closes.
 */
export class HistoryAssembly extends Disposable {
  /** the consumer id of the history in the selections */
  static readonly CONSUMER = "history"
  readonly settings: HistorySettingsStore
  readonly store: HistoryRepository
  readonly database: HistoryDatabase
  readonly recorder: HistoryRecorder
  readonly retention: HistoryRetention

  /** @param file history.db, or ":memory:" for tests */
  constructor(file: string, deps: HistoryDeps) {
    super()
    const log = deps.log.child({ component: "history" })
    const report = (message: string, error?: unknown) => log.warn({ err: error }, message)
    const database = this.database = HistoryDatabase.open(file, message => log.error(message))
    // registered first, so it closes last, after the recorder's final write
    this.onDispose(() => database.close())
    this.store = new HistoryRepository(database.db)
    this.settings = new HistorySettingsStore(deps.settings, message => log.warn(message))
    const recorder = this.recorder = this.own(new HistoryRecorder(this.store, deps.clock, () => this.settings.current, report))
    const selection = () => (this.settings.current.enabled ? deps.selections.of(HistoryAssembly.CONSUMER) : SignalSelection.NONE)
    this.own(new SelectedValues(deps.bus, deps.signals, selection, (signal, message) => recorder.record(signal, message), signal => recorder.release(signal.id)))
    this.listen(deps.signals, "unregistered", (signal: Signal) => recorder.forget(signal.id))
    this.retention = this.own(new HistoryRetention(this.store, deps.clock, () => this.settings.current, deps.signalExists, report))
  }
}
