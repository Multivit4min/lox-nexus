import { PowerSourceServer } from "@matter/main/behaviors/power-source"
import { PowerSource } from "@matter/main/clusters/power-source"

const Base = PowerSourceServer.with("Battery", "Rechargeable")
const { BatChargeState } = PowerSource

/**
 * A home battery's battery: its state of charge from Nexus and whether it is charging, from the
 * sign of its power. A home battery runs low every night, so it never asks for replacement and
 * its charge level stays OK. Voltage, times and charging current, which Matter's battery storage
 * type lists, are unknown; the capacity, which Matter can't leave unknown, is left out.
 */
export class StorageBatteryServer extends Base {
  static override readonly State = class extends Base.State {
    override status = PowerSource.PowerSourceStatus.Active
    override order = 0
    override description = "Battery storage"
    override batChargeLevel = PowerSource.BatChargeLevel.Ok
    override batReplacementNeeded = false
    override batReplaceability = PowerSource.BatReplaceability.Unspecified
    override batPercentRemaining: number | null = null
    override batChargeState = BatChargeState.Unknown
    override batFunctionalWhileCharging = true
    override batVoltage: number | null = null
    override batTimeRemaining: number | null = null
    override batTimeToFullCharge: number | null = null
    override batChargingCurrent: number | null = null
    override activeBatChargeFaults: PowerSource.BatChargeFault[] = []
  }

  /** the state of charge in % (Matter counts half percent) */
  static level(percent: number) {
    return { batPercentRemaining: Math.round(Math.min(100, Math.max(0, percent)) * 2) }
  }

  /** charging while power goes in, full at 100 %, otherwise not charging */
  static chargeState(watts: number, halfPercent: number | null) {
    if (watts > 0) return BatChargeState.IsCharging
    return halfPercent !== null && halfPercent >= 200 ? BatChargeState.IsAtFullCharge : BatChargeState.IsNotCharging
  }
}
