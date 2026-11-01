import { z } from "@lox-nexus/plugin-sdk"
import { Zone } from "./time/Zone.ts"

/** Instance config: only the time zone, since every schedule keeps its own settings. */
export const schedulerConfigSchema = z.object({
  // an emptied field arrives as "", which means the default like a missing one
  timeZone: z.string().trim().refine(zone => zone === "" || Zone.isValid(zone), "unknown time zone; use an IANA name such as Europe/Vienna").optional().meta({
    title: "Time zone",
    description: "IANA zone such as Europe/Vienna, which the times of all schedules are in. "
      + "Empty: the zone of the Loxone project Nexus read last, otherwise the server's (in a container usually UTC)"
  })
})

export type SchedulerConfig = z.infer<typeof schedulerConfigSchema>
