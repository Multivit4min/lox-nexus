import type { CatalogEntry, CatalogNode } from "@lox-nexus/plugin-sdk"
import { Weekdays } from "../params/Weekdays.ts"

const workdays = [...Weekdays.WORKDAYS]
const everyDay = [...Weekdays.ALL]

/**
 * Ready-made schedules of each kind to start from (their settings can be changed after adding),
 * and the Enabled and Skip next actuators for all schedules and for each group in use.
 */
export class SchedulerCatalog {
  /** the catalog node of a group's actuators; "" is all schedules */
  static groupId(group: string) {
    return group === "" ? "all" : `group:${group}`
  }

  constructor(private readonly groups: string[]) {}

  build(): CatalogNode[] {
    return [
      { label: "New schedules", id: "examples", entries: SchedulerCatalog.examples() },
      { label: "All schedules", id: SchedulerCatalog.groupId(""), entries: SchedulerCatalog.actuators("", "all schedules") },
      ...this.groups.map(group => ({ label: `Group "${group}"`, id: SchedulerCatalog.groupId(group), entries: SchedulerCatalog.actuators(group, `group ${group}`) }))
    ]
  }

  private static examples(): CatalogEntry[] {
    return [
      SchedulerCatalog.sensor("pulse", { trigger: "time", time: "06:30", weekdays: workdays }, "Pulse at 06:30 on workdays"),
      SchedulerCatalog.sensor("pulse", { trigger: "cron", cron: "*/15 * * * *" }, "Pulse every 15 minutes"),
      SchedulerCatalog.sensor("window", { trigger: "time", start: "22:00", end: "06:00", weekdays: everyDay }, "Night 22:00–06:00"),
      SchedulerCatalog.sensor("window", { trigger: "time", start: "19:00", end: "23:00", weekdays: everyDay, randomMinutes: 20, group: "presence" },
        "Presence 19:00–23:00 ± 20 min"),
      SchedulerCatalog.sensor("value-number", SchedulerCatalog.steps(["06:00", workdays, 21], ["08:00", ["sat", "sun"], 21], ["22:00", everyDay, 18]),
        "Setpoint: 21 from 06:00 (weekends 08:00), 18 from 22:00"),
      SchedulerCatalog.sensor("value-boolean", SchedulerCatalog.steps(["07:00", workdays, true], ["08:30", workdays, false]), "On 07:00–08:30 on workdays"),
      SchedulerCatalog.sensor("value-text", SchedulerCatalog.steps(["07:00", everyDay, "day"], ["22:00", everyDay, "night"]), "\"day\" from 07:00, \"night\" from 22:00"),
      SchedulerCatalog.sensor("next-run", { trigger: "cron", cron: "0 7 * * MON-FRI" }, "Minutes until 07:00 on workdays", "min")
    ]
  }

  private static actuators(group: string, name: string): CatalogEntry[] {
    return [
      { kind: "actuator", capability: "enabled", params: { group }, label: `Enabled: ${name}` },
      { kind: "actuator", capability: "skip-next", params: { group }, label: `Skip next run: ${name}` }
    ]
  }

  private static steps(...steps: Array<[string, string[], unknown]>) {
    return { steps: steps.map(([time, weekdays, value]) => ({ trigger: "time", time, weekdays, value })) }
  }

  private static sensor(capability: string, params: object, label: string, unit?: string): CatalogEntry {
    return { kind: "sensor", capability, params, label, ...(unit ? { unit } : {}) }
  }
}
