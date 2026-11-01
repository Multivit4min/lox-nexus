import { randomBytes } from "node:crypto"
import { EventEmitter } from "node:events"
import { Plugin } from "@lox-nexus/plugin-sdk"
import { NextRunsAction } from "./actions/NextRunsAction.ts"
import { RunNowAction } from "./actions/RunNowAction.ts"
import { SetEnabledAction } from "./actions/SetEnabledAction.ts"
import { SkipAction } from "./actions/SkipAction.ts"
import { EnabledActuator } from "./actuators/EnabledActuator.ts"
import { SkipNextActuator } from "./actuators/SkipNextActuator.ts"
import { SchedulerCatalog } from "./catalog/SchedulerCatalog.ts"
import { SchedulerPanel } from "./panel/SchedulerPanel.ts"
import { schedulerConfigSchema, type SchedulerConfig } from "./SchedulerConfig.ts"
import { Schedules } from "./schedule/Schedules.ts"
import { BooleanValueSensor } from "./sensors/BooleanValueSensor.ts"
import { NextRunSensor } from "./sensors/NextRunSensor.ts"
import { NumberValueSensor } from "./sensors/NumberValueSensor.ts"
import { PulseSensor } from "./sensors/PulseSensor.ts"
import { TextValueSensor } from "./sensors/TextValueSensor.ts"
import { WindowSensor } from "./sensors/WindowSensor.ts"
import { RunLog } from "./state/RunLog.ts"
import { Skips } from "./state/Skips.ts"
import { Switches } from "./state/Switches.ts"
import { Zone } from "./time/Zone.ts"

/**
 * Sends values at set times. Each schedule is one sensor whose params are the schedule (a time
 * of day on weekdays, or a cron expression): a value or a pulse at each run, a window that is on
 * between two times, or when the next run is. Wires take the values to Loxone or other plugins;
 * the plugin itself never touches another signal. Actuators switch groups of schedules off and
 * skip their next run.
 */
export class SchedulerPlugin extends Plugin<SchedulerConfig> {
  static readonly config = schedulerConfigSchema
  static readonly sensors = [PulseSensor, WindowSensor, NumberValueSensor, BooleanValueSensor, TextValueSensor, NextRunSensor]
  static readonly actuators = [EnabledActuator, SkipNextActuator]
  static readonly actions = [NextRunsAction, RunNowAction, SkipAction, SetEnabledAction]
  static readonly panelUpdates = "push"
  static readonly PRUNE_MS = 3_600_000

  // Plugin.timeZone is the Loxone project's, or the server's without one
  readonly zone = new Zone(this.config.timeZone || this.timeZone)
  /** "changed" when a switch or a skip changed, so every schedule works out its state again */
  readonly changes = new EventEmitter()
  readonly switches = new Switches(this.store, () => this.changed())
  readonly skips = new Skips(this.store, () => this.changed())
  readonly runs = new RunLog(this.store, this.clock.now())
  readonly schedules = new Schedules()
  /** secret, so random offsets can't be predicted from the schedule; kept, so they survive restarts */
  readonly seed = this.loadSeed()

  private batching = false
  private changedInBatch = false

  override start() {
    // every schedule listens, and an instance may well have more than the default 10
    this.changes.setMaxListeners(0)
    this.skips.prune(this.clock.now())
    this.every(SchedulerPlugin.PRUNE_MS, () => this.skips.prune(this.clock.now()))
  }

  override catalog() {
    return new SchedulerCatalog(this.schedules.groups()).build()
  }

  override panel() {
    return new SchedulerPanel(this.schedules, this.switches, this.zone).build(this.clock.now())
  }

  /** runs `change` and tells the schedules once afterwards, however many switches or skips it changed */
  batch<T>(change: () => T): T {
    this.batching = true
    try {
      return change()
    } finally {
      this.batching = false
      if (this.changedInBatch) this.changed()
    }
  }

  private changed() {
    this.changedInBatch = this.batching
    if (this.batching) return
    this.changes.emit("changed")
    this.panelChanged()
  }

  private loadSeed() {
    const stored = this.store.get("seed")
    if (typeof stored === "string" && stored.length >= 16) return stored
    const seed = randomBytes(16).toString("hex")
    this.store.set("seed", seed)
    return seed
  }
}
