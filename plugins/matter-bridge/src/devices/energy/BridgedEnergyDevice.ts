import { BridgedDevice } from "../BridgedDevice.ts"
import type { KindValue, StateKind } from "../DeviceKinds.ts"
import type { DeviceRecord } from "../DeviceRecord.ts"
import { PowerMeter, type EnergyDirection } from "./PowerMeter.ts"

/**
 * An energy device (meter, PV system, battery storage, wallbox, heat pump): its electrical
 * measurements go to the power meter, the rest to the type. matter.js doesn't persist
 * measurements, so the ones Nexus sent last are set again once the endpoint is attached; one that
 * can't be set is a warning, not a device missing from the bridge.
 */
export abstract class BridgedEnergyDevice extends BridgedDevice {
  /** which energy totals the device has */
  protected abstract readonly direction: EnergyDirection
  private restored = false

  /** the endpoint's measurements; a getter, as subclasses create the endpoint after this class */
  protected get meter() {
    return new PowerMeter(this.endpoint, this.direction)
  }

  override async sync(record?: DeviceRecord) {
    await super.sync(record)
    if (this.restored) return
    this.restored = true
    const remembered = (kind: StateKind) => {
      const value = this.info.states.includes(kind) ? this.remembered(kind) : undefined
      return typeof value === "number" ? value : undefined
    }
    for (const kind of ["power", "production", "voltage", "current"] as const) {
      const value = remembered(kind)
      if (value !== undefined) await this.restoreMeasurement(kind, () => this.meter.apply(kind, value))
    }
    const energy = { imported: remembered("energyImported"), exported: remembered("energyExported") }
    if (energy.imported !== undefined || energy.exported !== undefined) await this.restoreMeasurement("energy", () => this.meter.energy(energy))
  }

  protected async apply(kind: StateKind, value: KindValue) {
    if (PowerMeter.handles(kind)) return this.meter.apply(kind, value)
    await this.applyOwn(kind, value)
  }

  /** the type's own states, besides the measurements; a meter-only type has none */
  protected async applyOwn(kind: StateKind, value: KindValue) {
    throw new Error(`a ${this.info.label.toLowerCase()} has no ${kind} state for ${JSON.stringify(value)}`)
  }

  private async restoreMeasurement(what: string, set: () => Promise<void>) {
    try {
      await set()
    } catch (error) {
      this.context.warn(`"${this.name}": could not show the ${what} Nexus sent before the restart: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
