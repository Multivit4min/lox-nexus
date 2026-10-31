import { z } from "zod"
import type { McpRefs } from "../../McpRefs.ts"
import type { McpTool } from "../../McpTool.ts"
import { MiniserverAnswer, type MiniserverWrites } from "./MiniserverWrites.ts"

const Start = z.object({ miniserver: z.string().min(1).max(100).describe("the Miniserver's slug") })
const Stop = Start.extend({ confirmation: z.string().max(64).optional().describe("from the first call's answer; without it nothing stops") })

/** Starts a stopped Miniserver connection; until the next boot, where `enabled` decides. */
export class StartMiniserverTool implements McpTool<z.infer<typeof Start>> {
  readonly name = "start_miniserver"
  readonly title = "Start a Miniserver connection"
  readonly description = "Start talking to a Miniserver again: Nexus listens for it and sends every output's value. Lasts until Nexus restarts; whether it runs then is the Miniserver's `enabled` setting (update_miniserver)."
  readonly scope = "configure" as const
  readonly changes = true
  readonly annotations = { idempotentHint: true }
  readonly input = Start

  constructor(private readonly refs: Pick<McpRefs, "miniserver">, private readonly miniservers: Pick<MiniserverWrites, "start">) {}

  async run(input: z.infer<typeof Start>) {
    return MiniserverAnswer.of(await this.miniservers.start(this.refs.miniserver(input.miniserver).id))
  }
}

/** Stops a Miniserver connection after a confirmation: the house loses this path until it starts again. */
export class StopMiniserverTool implements McpTool<z.infer<typeof Stop>> {
  readonly name = "stop_miniserver"
  readonly title = "Stop a Miniserver connection"
  readonly description = "Stop talking to a Miniserver: no values flow either way until start_miniserver or a restart of Nexus. The first call answers what that means and a confirmation; call again with it to stop."
  readonly scope = "configure" as const
  readonly changes = true
  readonly annotations = { destructiveHint: true, idempotentHint: true }
  readonly input = Stop

  constructor(private readonly refs: Pick<McpRefs, "miniserver">, private readonly miniservers: Pick<MiniserverWrites, "stop">) {}

  confirm(input: z.infer<typeof Stop>) {
    const ms = this.refs.miniserver(input.miniserver)
    return { summary: `stops the connection to "${ms.label}" (${ms.slug}): values stop flowing both ways until it is started again`, bind: ms.id }
  }

  async run(input: z.infer<typeof Stop>) {
    return MiniserverAnswer.of(await this.miniservers.stop(this.refs.miniserver(input.miniserver).id))
  }
}
