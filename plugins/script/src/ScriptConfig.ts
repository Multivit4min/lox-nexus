import { code, z } from "@lox-nexus/plugin-sdk"
import { ZoneOffsets } from "./run/ZoneOffsets.ts"
import { TEMPLATE } from "./template.ts"

/** Instance config: the script itself, and the zone its Date works in. Saving the instance restarts it, which reloads the script. */
export const scriptConfigSchema = z.object({
  script: code(z.string().max(200_000).default(TEMPLATE)
    .describe("JavaScript run when the instance starts; exchanges values with Nexus through `nexus.set`, `nexus.on` and `nexus.get`")),
  timeZone: z.string().refine(ZoneOffsets.isValid, "unknown time zone").optional().meta({
    title: "Time zone",
    description: "IANA zone such as Europe/Vienna that the script's Date works in. "
      + "Empty: the zone of the Loxone project Nexus read last, otherwise the server's (in a container usually UTC)"
  })
})

export type ScriptConfig = z.infer<typeof scriptConfigSchema>
