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
/** energy counters both ways, as totals */
export const EnergyServer = ElectricalEnergyMeasurementServer.with("ImportedEnergy", "ExportedEnergy", "CumulativeEnergy")
/** the measurements are of this device; matter.js then lists the endpoint as an electrical sensor too */
export const TopologyServer = PowerTopologyServer.with("TreeTopology")

/** the meter's kinds; `production` is power in the other direction, positive while a PV system feeds in */
export const METER_KINDS = ["power", "production", "energyImported", "energyExported", "voltage", "current"] as const satisfies readonly StateKind[]
type MeterKind = typeof METER_KINDS[number]

/** what the bridge claims about its accuracy: it passes on what Nexus measured, at about 1 % */
const accuracy = (measurementType: MeasurementType, limit: number) => ({
  measurementType, measured: true, minMeasuredValue: -limit, maxMeasuredValue: limit,
  accuracyRanges: [{ rangeMin: -limit, rangeMax: limit, percentMax: 100 }]
})

/**
 * The electrical measurements of an energy device (an electrical sensor in Matter's terms): power
 * in W, voltage in V, current in A, and the imported and exported energy in kWh, as Matter's mW,
 * mV, mA and mWh. Power counts as Matter does, positive while the device takes power; a PV
 * system's production comes as a positive `production` and is shown negative. Everything is
 * unknown until Nexus sends it.
 */
export class PowerMeter {
  /** 1 MW, 1 MV, 1 kA: the measurement ranges the bridge reports */
  static readonly LIMIT = 1_000_000_000

  constructor(private readonly endpoint: Endpoint) {}

  /** the clusters' state on creation */
  static initial() {
    return {
      electricalPowerMeasurement: {
        powerMode: ElectricalPowerMeasurement.PowerMode.Ac,
        numberOfMeasurementTypes: 3,
        accuracy: [MeasurementType.ActivePower, MeasurementType.Voltage, MeasurementType.ActiveCurrent].map(type => accuracy(type, PowerMeter.LIMIT)),
        activePower: null,
        voltage: null,
        activeCurrent: null
      },
      electricalEnergyMeasurement: {
        accuracy: accuracy(MeasurementType.ElectricalEnergy, Number.MAX_SAFE_INTEGER),
        cumulativeEnergyImported: null,
        cumulativeEnergyExported: null
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
    // kWh as mWh; the totals come with Matter's CumulativeEnergyMeasured event
    const energy = { energy: Math.max(0, Math.round(BridgedDevice.number(value) * 1_000_000)) }
    const cumulativeEnergy = kind === "energyImported" ? { imported: energy } : { exported: energy }
    await this.endpoint.act(agent => agent.get(EnergyServer).setMeasurement({ cumulativeEnergy }))
  }
}
