import type { Endpoint } from "@matter/main"
import { ElectricalEnergyMeasurementServer } from "@matter/main/behaviors/electrical-energy-measurement"
import { ElectricalPowerMeasurementServer } from "@matter/main/behaviors/electrical-power-measurement"
import { PowerTopologyServer } from "@matter/main/behaviors/power-topology"
import { ElectricalPowerMeasurement } from "@matter/main/clusters/electrical-power-measurement"
import { MeasurementType } from "@matter/main/types"
import { BridgedDevice } from "../BridgedDevice.ts"
import type { KindValue, StateKind } from "../DeviceKinds.ts"

/** power, voltage and current of an AC device */
export const PowerServer = ElectricalPowerMeasurementServer.with("AlternatingCurrent")
/** energy totals: both ways (meter, battery), only produced (PV) or only used (wallbox, heat pump) */
export const EnergyServers = {
  both: ElectricalEnergyMeasurementServer.with("ImportedEnergy", "ExportedEnergy", "CumulativeEnergy"),
  imported: ElectricalEnergyMeasurementServer.with("ImportedEnergy", "CumulativeEnergy"),
  exported: ElectricalEnergyMeasurementServer.with("ExportedEnergy", "CumulativeEnergy")
}
export type EnergyDirection = keyof typeof EnergyServers

/** an energy total as Matter keeps it */
interface Measured { energy: number | bigint }
/** the measurements are of this device; matter.js then lists the endpoint as an electrical sensor too */
export const TopologyServer = PowerTopologyServer.with("TreeTopology")

/** the meter's kinds; `production` is power in the other direction, positive while a PV system feeds in */
export const METER_KINDS = ["power", "production", "energyImported", "energyExported", "voltage", "current"] as const satisfies readonly StateKind[]
type MeterKind = typeof METER_KINDS[number]

/** what the bridge claims about its accuracy: it passes on what Nexus measured, at about 1 % */
const accuracy = (measurementType: MeasurementType, min: number, max: number) => ({
  measurementType, measured: true, minMeasuredValue: min, maxMeasuredValue: max,
  accuracyRanges: [{ rangeMin: min, rangeMax: max, percentMax: 100 }]
})

/**
 * The electrical measurements of an energy device (an electrical sensor in Matter's terms): power
 * in W, voltage in V, current in A, and the imported and exported energy in kWh, as Matter's mW,
 * mV, mA and mWh. Power and current count as Matter does, positive while the device takes power; a
 * PV system's production comes as a positive `production` and is shown negative. Everything is
 * unknown until Nexus sends it. Each energy event carries both totals the device has.
 */
export class PowerMeter {
  /** 1 MW, 1 MV, 1 MA: the measurement ranges the bridge reports (in mW, mV, mA) */
  static readonly LIMIT = 1_000_000_000

  constructor(private readonly endpoint: Endpoint, private readonly direction: EnergyDirection) {}

  /** the clusters' state on creation */
  static initial(direction: EnergyDirection) {
    return {
      electricalPowerMeasurement: {
        powerMode: ElectricalPowerMeasurement.PowerMode.Ac,
        numberOfMeasurementTypes: 3,
        accuracy: [MeasurementType.ActivePower, MeasurementType.Voltage, MeasurementType.ActiveCurrent].map(type => accuracy(type, -PowerMeter.LIMIT, PowerMeter.LIMIT)),
        activePower: null,
        voltage: null,
        activeCurrent: null
      },
      electricalEnergyMeasurement: {
        accuracy: accuracy(MeasurementType.ElectricalEnergy, 0, Number.MAX_SAFE_INTEGER),
        ...(direction !== "exported" ? { cumulativeEnergyImported: null } : {}),
        ...(direction !== "imported" ? { cumulativeEnergyExported: null } : {})
      }
    }
  }

  static handles(kind: StateKind): kind is MeterKind {
    return (METER_KINDS as readonly StateKind[]).includes(kind)
  }

  async apply(kind: MeterKind, value: KindValue) {
    const milli = Math.round(BridgedDevice.number(value) * 1000)
    if (kind === "power") return this.endpoint.setStateOf(PowerServer, { activePower: milli })
    if (kind === "production") return this.endpoint.setStateOf(PowerServer, { activePower: -milli })
    if (kind === "voltage") return this.endpoint.setStateOf(PowerServer, { voltage: milli })
    if (kind === "current") return this.endpoint.setStateOf(PowerServer, { activeCurrent: milli })
    const kwh = BridgedDevice.number(value)
    await this.energy(kind === "energyImported" ? { imported: kwh } : { exported: kwh })
  }

  /**
   * New energy totals in kWh, with Matter's CumulativeEnergyMeasured event. The event carries both
   * totals the device has: a side not given now is the one shown, if Nexus has sent it before.
   */
  async energy(kwh: { imported?: number; exported?: number }) {
    const server = EnergyServers[this.direction]
    const shown = this.endpoint.stateOf(server) as { cumulativeEnergyImported?: Measured | null; cumulativeEnergyExported?: Measured | null }
    const side = (value: number | undefined, current: Measured | null | undefined) =>
      value !== undefined ? { energy: Math.max(0, Math.round(value * 1_000_000)) } : current ?? undefined
    const cumulativeEnergy = { imported: side(kwh.imported, shown.cumulativeEnergyImported), exported: side(kwh.exported, shown.cumulativeEnergyExported) }
    await this.endpoint.act(agent => agent.get(server).setMeasurement({ cumulativeEnergy }))
  }
}
