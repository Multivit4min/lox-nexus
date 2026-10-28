import { code, z } from "@lox-nexus/plugin-sdk"
import { TEMPLATE } from "./template.ts"

/** Instance config: the script itself. Saving the instance restarts it, which reloads the script. */
export const scriptConfigSchema = z.object({
  script: code(z.string().max(200_000).default(TEMPLATE)
    .describe("JavaScript run when the instance starts; exchanges values with Nexus through `nexus.set`, `nexus.on` and `nexus.get`"))
})

export type ScriptConfig = z.infer<typeof scriptConfigSchema>
