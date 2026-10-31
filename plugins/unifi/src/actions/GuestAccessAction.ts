import { Action, z } from "@lox-nexus/plugin-sdk"
import { checkClientMac, clientMacIssue, clientShape } from "../params/ClientParams.ts"
import type { UnifiPlugin } from "../UnifiPlugin.ts"

const input = z.object({
  ...clientShape,
  authorize: z.boolean().default(true).meta({ title: "Authorize", description: "On: let the guest on. Off: throw it off" }),
  minutes: z.number().int().min(1).max(1_000_000).optional().meta({ title: "Minutes", description: "How long; empty: the site's default" })
}).refine(checkClientMac, clientMacIssue)

/** Authorize or unauthorize, on the rows of guest clients in the Clients table. */
export class GuestAccessAction extends Action<UnifiPlugin, z.infer<typeof input>> {
  static readonly id = "guest-access"
  static readonly label = "Guest access"
  static readonly description = "Lets a connected guest on the hotspot, or throws it off"
  static readonly input = input
  static readonly placement = "panel"

  async run() {
    const outcome = await this.plugin.guests.set(this.input, this.input.authorize, this.input.minutes)
    this.plugin.log.info(`${outcome} from the panel`)
    await this.plugin.poller.poll()
    this.plugin.panelChanged()
    return outcome
  }
}
