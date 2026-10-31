import { EnergyEvseModeServer } from "@matter/main/behaviors/energy-evse-mode"
import { EnergyEvseMode } from "@matter/main/clusters/energy-evse-mode"
import type { ChargingMode } from "../DeviceKinds.ts"

const { ModeTag } = EnergyEvseMode

/** the modes by their Nexus name, in Matter's mode numbers */
export const CHARGING_MODES: Record<ChargingMode, number> = { "manual": 0, "time-of-use": 1, "solar": 2 }

/**
 * A wallbox's charging modes: manual (charge when enabled), time of use (cheap hours) and solar
 * (surplus only). matter.js changes the mode on an app's request; the bridge passes it on.
 */
export class EvseModeServer extends EnergyEvseModeServer {
  static override readonly State = class extends EnergyEvseModeServer.State {
    override supportedModes = [
      { label: "Manual", mode: CHARGING_MODES.manual, modeTags: [{ value: ModeTag.Manual }] },
      { label: "Time of use", mode: CHARGING_MODES["time-of-use"], modeTags: [{ value: ModeTag.TimeOfUse }] },
      { label: "Solar charging", mode: CHARGING_MODES.solar, modeTags: [{ value: ModeTag.SolarCharging }] }
    ]
    override currentMode = CHARGING_MODES.manual
  }

  static mode(name: unknown) {
    const key = typeof name === "string" ? name.trim().toLowerCase() : ""
    const mode = Object.hasOwn(CHARGING_MODES, key) ? CHARGING_MODES[key as ChargingMode] : undefined
    if (mode === undefined) throw new Error(`not a charging mode: ${JSON.stringify(name)}; one of ${Object.keys(CHARGING_MODES).join(", ")}`)
    return mode
  }

  static modeName(mode: number) {
    return Object.entries(CHARGING_MODES).find(([, value]) => value === mode)?.[0] ?? String(mode)
  }
}
