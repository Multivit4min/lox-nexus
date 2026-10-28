import { HistoryRecorder, HistoryRetention, SelectedValues, SignalSelection, type Clock, type EventBus, type Signal, type SignalRegistry } from "@lox-nexus/core"
import { Disposable } from "@lox-nexus/plugin-sdk"
import type { Logger } from "pino"
import { HistoryDatabase } from "../db/history/HistoryDatabase.ts"
import { HistoryReadRepository } from "../db/history/HistoryReadRepository.ts"
import { HistoryRepository } from "../db/history/HistoryRepository.ts"
import type { SettingsRepository } from "../db/repositories/SettingsRepository.ts"
import type { Controller } from "../http/Controller.ts"
import { HistoryController } from "../http/controllers/HistoryController.ts"
import { SelectionController } from "../http/controllers/SelectionController.ts"
import type { SelectionService } from "../services/SelectionService.ts"
import { HistoryService } from "./HistoryService.ts"
import { HistorySettingsStore } from "./HistorySettingsStore.ts"

/** What the history needs from the app. */
export interface HistoryDeps {
  bus: Pick<EventBus, "subscribe" | "current">
  signals: Pick<SignalRegistry, "atTopic" | "get" | "list" | "on" | "off">
  settings: SettingsRepository
  /** whether a signal is in the configuration; history of one that isn't goes after a grace period */
  signalExists: (signalId: string) => boolean
  selections: Pick<SelectionService, "of" | "setMode" | "setRules" | "on" | "off">
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
  readonly service: HistoryService
  private readonly selections: HistoryDeps["selections"]

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
    this.listen(deps.selections, "changed", (consumer: string) => consumer === HistoryAssembly.CONSUMER && this.reconcile(deps, selection))
    this.listen(this.settings, "changed", () => this.reconcile(deps, selection))
    this.retention = this.own(new HistoryRetention(this.store, deps.clock, () => this.settings.current, deps.signalExists, report))
    this.service = new HistoryService({
      reader: new HistoryReadRepository(database.db), store: this.store, settings: this.settings, signals: deps.signals,
      selection: () => deps.selections.of(HistoryAssembly.CONSUMER), forget: id => recorder.forget(id), dropped: () => recorder.dropped, clock: deps.clock, file
    })
    this.selections = deps.selections
  }

  /**
   * Applies a changed selection at once: a signal that left it pauses now, not at its next value,
   * and a paused one that is back records again from its current value. Without this a signal
   * that changes rarely would be drawn holding its value across the time it wasn't recorded.
   */
  private reconcile(deps: HistoryDeps, selection: () => SignalSelection) {
    const included = selection()
    for (const signal of deps.signals.list()) {
      if (!included.includes(signal)) {
        if (this.recorder.isRecording(signal.id)) this.recorder.release(signal.id)
        continue
      }
      if (!this.recorder.isPaused(signal.id)) continue
      const current = deps.bus.current(signal.topic)
      if (current?.value && (current.kind === "state" || current.kind === "command")) {
        // recorded as of now, without the restored flag a boot snapshot may still carry
        const flags = { ...current.flags }
        delete flags.restored
        this.recorder.record(signal, { ...current, value: current.value, ts: deps.clock.now(), flags })
      } else {
        this.recorder.resume(signal.id)
      }
    }
  }

  /**
   * The history API, and the selections API for the history and for plugin instances that watch
   * signals (`watching` says whether an id is one).
   */
  controllers(watching: (consumer: string) => boolean): Controller[] {
    return [
      new HistoryController(this.service, this.settings),
      new SelectionController(this.selections, consumer => consumer === HistoryAssembly.CONSUMER || watching(consumer))
    ]
  }
}
