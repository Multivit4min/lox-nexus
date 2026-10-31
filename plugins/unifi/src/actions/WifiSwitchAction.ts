import { Action, z } from "@lox-nexus/plugin-sdk"
import type { UnifiPlugin } from "../UnifiPlugin.ts"

const input = z.object({
  network: z.string().min(1).meta({ title: "Wi-Fi network", description: "The network's id, as the panel fills it in" }),
  enabled: z.boolean().meta({ title: "On" })
})

/** The switch next to each Wi-Fi network on the panel: switches the network on or off. */
export class WifiSwitchAction extends Action<UnifiPlugin, z.infer<typeof input>> {
  static readonly id = "set-wifi"
  static readonly label = "Switch Wi-Fi network"
  static readonly description = "Switches a Wi-Fi network, such as the guest network, on or off"
  static readonly input = input
  static readonly placement = "panel"
  static readonly confirm = "Switch this Wi-Fi network? Devices on it lose their connection while it is off."

  async run() {
    const { network, enabled } = this.input
    const result = await this.plugin.wifi.setById(network, enabled)
    const state = enabled ? "on" : "off"
    if (result.changed) this.plugin.log.info(`switched Wi-Fi network "${result.name}" ${state} from the panel`)
    await this.plugin.poller.poll()
    this.plugin.panelChanged()
    return result.changed ? `${result.name} is ${state}` : `${result.name} was already ${state}`
  }
}
