import { signalGroup, z } from "@lox-nexus/plugin-sdk"

/** What an actuator acts on: the schedules of a group, or all of the instance. */
export const targetParams = z.object({
  group: signalGroup(z.string().trim().max(100).default("").meta({
    title: "Group",
    description: "The schedules whose Group is this, e.g. \"presence\". Empty: all schedules of the instance"
  }))
})

export type Target = z.output<typeof targetParams>

/** "all schedules" or "group \"presence\"", for log lines */
export function targetName(group: string) {
  return group === "" ? "all schedules" : `group "${group}"`
}
