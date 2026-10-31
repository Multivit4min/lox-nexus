import { Value } from "@lox-nexus/plugin-sdk/values"
import type { NetworkSnapshot } from "../poll/NetworkSnapshot.ts"
import { wifiParamsSchema, type WifiParams } from "../params/WifiParams.ts"
import { WifiSwitch } from "../services/WifiSwitch.ts"
import { PollSensor } from "./PollSensor.ts"

/** true while a Wi-Fi network is switched on ("Wifi broadcast overview".enabled), e.g. the guest network. */
export class WifiEnabledSensor extends PollSensor<WifiParams> {
  static readonly id = "wifi-enabled"
  static readonly label = "Wi-Fi network on"
  static readonly description = "true while the Wi-Fi network (e.g. the guest network) is switched on"
  static readonly params = wifiParamsSchema
  static readonly valueType = "boolean"

  protected update(snapshot: NetworkSnapshot) {
    if (!snapshot.wifi) return this.fail(`can't list the Wi-Fi networks: ${snapshot.wifiProblem ?? "unknown"}`)
    try {
      this.emit(Value.boolean(WifiSwitch.pick(snapshot.wifi, this.params.network).enabled))
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error))
    }
  }
}
