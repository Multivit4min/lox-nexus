import type { Cell, PanelPart, RowAction } from "@lox-nexus/plugin-sdk"
import { NextRunsAction } from "../actions/NextRunsAction.ts"
import { RunNowAction } from "../actions/RunNowAction.ts"
import { SkipAction } from "../actions/SkipAction.ts"
import type { ScheduleView } from "../schedule/ScheduleView.ts"
import type { Zone } from "../time/Zone.ts"
import { SchedulerCatalog } from "../catalog/SchedulerCatalog.ts"

/** The table of schedules: what, when, the next run counting down, the last run and the state. */
export class ScheduleTable {
  static readonly COLUMNS = ["Schedule", "Kind", "When", "Group", "Next", "Last run", "State"]

  constructor(private readonly zone: Zone, private readonly now: number) {}

  build(schedules: ScheduleView[]): PanelPart {
    return {
      type: "table",
      columns: ScheduleTable.COLUMNS,
      rows: schedules.map(schedule => this.row(schedule)),
      rowActions: schedules.map(schedule => this.actions(schedule)),
      rowCatalog: schedules.map(schedule => SchedulerCatalog.groupId(schedule.group))
    }
  }

  private row(schedule: ScheduleView): Cell[] {
    const last = schedule.lastRun(this.now)
    return [
      schedule.name, schedule.kind, schedule.summary, schedule.group,
      this.next(schedule), last === undefined ? { text: "never", tone: "muted" } : { at: last },
      this.state(schedule)
    ]
  }

  private next(schedule: ScheduleView): Cell {
    const next = schedule.next(this.now)
    if (!next) return { text: "none", tone: "muted" }
    const turns = next.turns ? `${next.turns} ` : ""
    const value = next.value === undefined ? "" : ` → ${next.value}`
    return { text: `${turns}${this.zone.dateTime(next.at)}${value}`, until: next.at }
  }

  private state(schedule: ScheduleView): Cell {
    const off = schedule.offReason()
    if (off) return { text: `disabled: ${off}`, tone: "muted" }
    const on = schedule.isOn(this.now)
    const window = on === undefined ? "" : on ? ", on" : ", off"
    if (schedule.skipping(this.now)) return { text: `skips next${window}`, tone: "warn" }
    return { text: `enabled${window}`, tone: on === false ? "info" : "ok" }
  }

  private actions(schedule: ScheduleView): RowAction[] {
    const input = { schedule: schedule.key }
    const skipping = schedule.skipping(this.now)
    const actions: RowAction[] = []
    if (schedule.canRun) actions.push({ action: RunNowAction.id, label: "Run now", input, instant: true })
    actions.push({ action: SkipAction.id, label: skipping ? "Don't skip" : "Skip next", input: { ...input, skip: !skipping }, instant: true })
    actions.push({ action: NextRunsAction.id, label: "Next runs", input: { source: "schedule", ...input }, instant: true })
    return actions
  }
}
