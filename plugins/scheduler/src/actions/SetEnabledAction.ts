import { Action, z } from "@lox-nexus/plugin-sdk"
import { targetName } from "../params/TargetParams.ts"
import type { SchedulerPlugin } from "../SchedulerPlugin.ts"

const input = z.object({
  group: z.string().max(100).default("").meta({ title: "Group", description: "Empty: all schedules" }),
  enabled: z.boolean().meta({ title: "On" })
})

/** The panel's switches: all schedules, or one group, on or off, like the Enabled actuator. */
export class SetEnabledAction extends Action<SchedulerPlugin, z.infer<typeof input>> {
  static readonly id = "set-enabled"
  static readonly label = "Switch schedules"
  static readonly description = "Switches all schedules, or the schedules of a group, on or off"
  static readonly input = input
  static readonly placement = "panel"

  run() {
    const { group, enabled } = this.input
    const name = targetName(group)
    const state = enabled ? "on" : "off"
    if (!this.plugin.switches.set(group, enabled)) return `${name} were already ${state}`
    this.plugin.log.info(`switched ${name} ${state} from the panel`)
    return `Switched ${name} ${state}`
  }
}
