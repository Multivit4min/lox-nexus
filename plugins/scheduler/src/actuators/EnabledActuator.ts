import { Actuator } from "@lox-nexus/plugin-sdk"
import type { ValueOf } from "@lox-nexus/plugin-sdk/values"
import { targetName, targetParams, type Target } from "../params/TargetParams.ts"
import type { SchedulerPlugin } from "../SchedulerPlugin.ts"

/**
 * Switches a group of schedules, or all of them, on or off, e.g. off during holidays. Off
 * schedules send nothing, and windows send false. Kept in the store, so it survives restarts. A
 * value the host replays after a start is applied too: it is a state, and applying it again
 * changes nothing.
 */
export class EnabledActuator extends Actuator<SchedulerPlugin, Target, ValueOf<"boolean">> {
  static readonly id = "enabled"
  static readonly label = "Enabled"
  static readonly description = "Switches the schedules of a group, or all of them, on (true) or off (false)"
  static readonly params = targetParams
  static readonly accepts = "boolean"

  run(value: ValueOf<"boolean">) {
    const { group } = this.params
    if (!this.plugin.switches.set(group, value.value)) return
    this.plugin.log.info(`switched ${targetName(group)} ${value.value ? "on" : "off"}, asked by signal "${this.signal.label}"`)
  }
}
