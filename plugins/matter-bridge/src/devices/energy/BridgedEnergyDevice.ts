import { BridgedDevice } from "../BridgedDevice.ts"
import type { KindValue, StateKind } from "../DeviceKinds.ts"
import type { DeviceRecord } from "../DeviceRecord.ts"
import { METER_KINDS, PowerMeter } from "./PowerMeter.ts"
import { WiredPowerServer } from "./WiredPowerServer.ts"

/**
 * An energy device (meter, PV system, battery storage, wallbox, heat pump): its electrical
 * measurements go to the power meter, the rest to the type. matter.js doesn't persist
 * measurements, so the ones Nexus sent last are set again once the endpoint is attached.
 */
export abstract class BridgedEnergyDevice extends BridgedDevice {
  private restored = false

  /** the endpoint's measurements; a getter, as subclasses create the endpoint after this class */
  protected get meter() {
    return new PowerMeter(this.endpoint)
  }

  override async sync(record?: DeviceRecord) {
    await super.sync(record)
    // the mains power source names the endpoint it powers, once its number is known
    if (this.endpoint.behaviors.has(WiredPowerServer)) {
      const endpointList = [this.endpoint.number]
      if (JSON.stringify(this.endpoint.stateOf(WiredPowerServer).endpointList) !== JSON.stringify(endpointList)) {
        await this.endpoint.setStateOf(WiredPowerServer, { endpointList })
      }
    }
    if (this.restored) return
    this.restored = true
    for (const kind of METER_KINDS) {
      const value = this.info.states.includes(kind) ? this.remembered(kind) : undefined
      if (typeof value === "number") await this.meter.apply(kind, value)
    }
  }

  protected async apply(kind: StateKind, value: KindValue) {
    if (PowerMeter.handles(kind)) return this.meter.apply(kind, value)
    await this.applyOwn(kind, value)
  }

  /** the type's own states, besides the measurements; a meter-only type has none */
  protected async applyOwn(kind: StateKind, value: KindValue) {
    throw new Error(`a ${this.info.label.toLowerCase()} has no ${kind} state for ${JSON.stringify(value)}`)
  }
}
