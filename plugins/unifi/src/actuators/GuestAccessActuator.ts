import { Actuator, z, type ActuatorCommand } from "@lox-nexus/plugin-sdk"
import type { ValueOf } from "@lox-nexus/plugin-sdk/values"
import { checkClientMac, clientMacIssue, clientShape } from "../params/ClientParams.ts"
import type { UnifiPlugin } from "../UnifiPlugin.ts"

const params = z.object({
  ...clientShape,
  minutes: z.number().int().min(1).max(1_000_000).optional().meta({
    title: "Minutes",
    description: "How long the guest may use the network. Empty: the site's default"
  })
}).refine(checkClientMac, clientMacIssue)

/**
 * Lets a connected guest client on the network (true) or throws it off (false), through the
 * API's guest access actions. Authorizing again starts a new authorization, so a value the host
 * replays after a start is skipped: the console keeps the authorization anyway.
 */
export class GuestAccessActuator extends Actuator<UnifiPlugin, z.infer<typeof params>, ValueOf<"boolean">> {
  static readonly id = "guest-access"
  static readonly label = "Guest access"
  static readonly description = "true authorizes a connected guest client on the hotspot, false unauthorizes it"
  static readonly params = params
  static readonly accepts = "boolean"

  async run(value: ValueOf<"boolean">, command?: ActuatorCommand) {
    if (command?.replayed) return
    const outcome = await this.plugin.guests.set(this.params, value.value, this.params.minutes)
    this.plugin.log.info(outcome, { signal: this.signal.label })
    void this.plugin.poller.poll()
  }
}
