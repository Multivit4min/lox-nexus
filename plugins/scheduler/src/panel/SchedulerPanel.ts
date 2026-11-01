import type { Panel } from "@lox-nexus/plugin-sdk"
import { SetEnabledAction } from "../actions/SetEnabledAction.ts"
import { SchedulerCatalog } from "../catalog/SchedulerCatalog.ts"
import type { Schedules } from "../schedule/Schedules.ts"
import type { Switches } from "../state/Switches.ts"
import type { Zone } from "../time/Zone.ts"
import { ScheduleTable } from "./ScheduleTable.ts"

type Section = Extract<Panel, { type: "sections" }>["sections"][number]

/**
 * The status view: a switch for all schedules and one per group, and the table of schedules.
 * Read from memory only; the plugin pushes it when a run fires or a state changes.
 */
export class SchedulerPanel {
  constructor(private readonly schedules: Schedules, private readonly switches: Switches, private readonly zone: Zone) {}

  build(now: number): Panel {
    const list = this.schedules.list()
    const table: Section = list.length === 0
      ? { title: "Schedules", panel: { type: "notice", tone: "info", text: "No schedules yet. Add a sensor of this instance (Pulse, Window, Next run or a value at a time); its settings are the schedule." } }
      : { title: "Schedules", panel: new ScheduleTable(this.zone, now).build(list) }
    return { type: "sections", sections: [this.switchSection(), table] }
  }

  private switchSection(): Section {
    const groups = [...new Set([...this.schedules.groups(), ...this.switches.offGroups])].sort()
    const items = [
      { label: "Time zone", value: this.zone.id },
      this.item("All schedules", ""),
      ...groups.map(group => this.item(`Group "${group}"`, group))
    ]
    return { title: "Switched on", panel: { type: "keyValue", items } }
  }

  private item(label: string, group: string) {
    const on = this.switches.isOn(group)
    return {
      label,
      value: on ? { text: "on", tone: "ok" as const } : { text: "off", tone: "muted" as const },
      control: { action: SetEnabledAction.id, switch: { checked: on }, input: { group, enabled: !on } },
      catalog: SchedulerCatalog.groupId(group)
    }
  }
}
