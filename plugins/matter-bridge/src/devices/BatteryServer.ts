import { PowerSourceServer } from "@matter/main/behaviors/power-source"
import { PowerSource } from "@matter/main/clusters/power-source"

const Base = PowerSourceServer.with("Battery")
const { BatChargeLevel } = PowerSource

/**
 * A battery-powered device's battery (PowerSource with the Battery feature). The level comes from
 * Nexus; the charge level the apps warn on follows it: a warning below 20 %, critical (and
 * "replace the battery") below 10 %.
 * Unknown until Nexus sends a level.
 */
export class BatteryServer extends Base {
  static override readonly State = class extends Base.State {
    override status = PowerSource.PowerSourceStatus.Active
    override order = 0
    override description = "Battery"
    override batChargeLevel = BatChargeLevel.Ok
    override batReplacementNeeded = false
    override batReplaceability = PowerSource.BatReplaceability.Unspecified
    override batPercentRemaining: number | null = null
  }

  /** the attributes for a level in %; Matter counts half percent */
  static level(percent: number) {
    const limited = Math.min(100, Math.max(0, percent))
    const batChargeLevel = limited < 10 ? BatChargeLevel.Critical : limited < 20 ? BatChargeLevel.Warning : BatChargeLevel.Ok
    return { batPercentRemaining: Math.round(limited * 2), batChargeLevel, batReplacementNeeded: batChargeLevel === BatChargeLevel.Critical }
  }
}
