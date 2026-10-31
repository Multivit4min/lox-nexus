import { Actuator } from "@lox-nexus/plugin-sdk"
import type { ValueOf } from "@lox-nexus/plugin-sdk/values"
import { wifiParamsSchema, type WifiParams } from "../params/WifiParams.ts"
import type { UnifiPlugin } from "../UnifiPlugin.ts"

/**
 * Switches a Wi-Fi network (e.g. the guest network) on or off. Nothing is sent when it already
 * is, so a replayed value after a start just confirms the state.
 */
export class WifiEnabledActuator extends Actuator<UnifiPlugin, WifiParams, ValueOf<"boolean">> {
  static readonly id = "wifi-enabled"
  static readonly label = "Wi-Fi network on/off"
  static readonly description = "Switches the Wi-Fi network (e.g. the guest network) on (true) or off (false)"
  static readonly params = wifiParamsSchema
  static readonly accepts = "boolean"
  static readonly concurrency = "latest"

  async run(value: ValueOf<"boolean">) {
    const result = await this.plugin.wifi.setByName(this.params.network, value.value)
    if (result.changed) this.plugin.log.info(`switched Wi-Fi network "${result.name}" ${value.value ? "on" : "off"}`, { signal: this.signal.label })
    void this.plugin.poller.poll()
  }
}
