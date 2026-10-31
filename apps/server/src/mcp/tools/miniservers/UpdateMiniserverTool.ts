import { z } from "zod"
import type { McpRefs } from "../../McpRefs.ts"
import type { McpTool } from "../../McpTool.ts"
import { MiniserverAnswer, MiniserverChanges, type MiniserverWrites } from "./MiniserverWrites.ts"

const Input = MiniserverChanges.extend({ miniserver: z.string().min(1).max(100).describe("the Miniserver's slug") }).strict()
type Input = z.input<typeof Input>

/** Changes a Miniserver's settings: only the fields given; the password stays. */
export class UpdateMiniserverTool implements McpTool<Input> {
  readonly name = "update_miniserver"
  readonly title = "Change a Miniserver"
  readonly description = "Change a Miniserver's settings: give only what changes (a new slug moves all its topics). The password is never touched; the user changes it on the Miniserver's page. A running Miniserver restarts with the new settings; enabled: false stops it."
  readonly scope = "configure" as const
  readonly changes = true
  readonly annotations = { idempotentHint: true }
  readonly input = Input as z.ZodType<Input>

  constructor(private readonly refs: Pick<McpRefs, "miniserver">, private readonly miniservers: Pick<MiniserverWrites, "update">) {}

  async run(input: Input) {
    const current = this.refs.miniserver(input.miniserver)
    const defined = Object.fromEntries(Object.entries(input).filter(([key, value]) => key !== "miniserver" && value !== undefined))
    return MiniserverAnswer.of(await this.miniservers.update(current.id, { ...MiniserverAnswer.input(current), ...defined }))
  }
}
