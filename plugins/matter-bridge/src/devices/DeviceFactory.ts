import type { BridgedDevice, DeviceContext } from "./BridgedDevice.ts"
import { BridgedAirQuality } from "./BridgedAirQuality.ts"
import { BridgedBlind } from "./BridgedBlind.ts"
import { BridgedButton } from "./BridgedButton.ts"
import { BridgedClimate } from "./BridgedClimate.ts"
import { BridgedColorLight } from "./BridgedColorLight.ts"
import { BridgedContact } from "./BridgedContact.ts"
import { BridgedCover } from "./BridgedCover.ts"
import { BridgedDimmer } from "./BridgedDimmer.ts"
import { BridgedFan } from "./BridgedFan.ts"
import { BridgedFlow } from "./BridgedFlow.ts"
import { BridgedHumidity } from "./BridgedHumidity.ts"
import { BridgedIlluminance } from "./BridgedIlluminance.ts"
import { BridgedLock } from "./BridgedLock.ts"
import { BridgedOccupancy } from "./BridgedOccupancy.ts"
import { BridgedPressure } from "./BridgedPressure.ts"
import { BridgedRgbLight } from "./BridgedRgbLight.ts"
import { BridgedSmokeAlarm } from "./BridgedSmokeAlarm.ts"
import { BridgedSwitch } from "./BridgedSwitch.ts"
import { BridgedTemperature } from "./BridgedTemperature.ts"
import { BridgedThermostat } from "./BridgedThermostat.ts"
import { BridgedValve } from "./BridgedValve.ts"
import { BridgedWaterSensor } from "./BridgedWaterSensor.ts"
import type { DeviceRecord } from "./DeviceRecord.ts"

/** Builds the bridged device for a stored one. */
export class DeviceFactory {
  constructor(private readonly context: DeviceContext) {}

  create(record: DeviceRecord): BridgedDevice {
    switch (record.type) {
      case "on-off-light":
      case "plug":
      case "wall-switch": return new BridgedSwitch(record, this.context)
      case "dimmable-light":
      case "dimmable-plug":
      case "wall-dimmer": return new BridgedDimmer(record, this.context)
      case "color-temperature-light": return new BridgedColorLight(record, this.context)
      case "window-covering": return new BridgedCover(record, this.context)
      case "thermostat": return new BridgedThermostat(record, this.context)
      case "fan": return new BridgedFan(record, this.context)
      case "door-lock": return new BridgedLock(record, this.context)
      case "temperature-sensor": return new BridgedTemperature(record, this.context)
      case "humidity-sensor": return new BridgedHumidity(record, this.context)
      case "contact-sensor": return new BridgedContact(record, this.context)
      case "occupancy-sensor": return new BridgedOccupancy(record, this.context)
      case "smoke-co-alarm": return new BridgedSmokeAlarm(record, this.context)
      case "light-sensor": return new BridgedIlluminance(record, this.context)
      case "pressure-sensor": return new BridgedPressure(record, this.context)
      case "flow-sensor": return new BridgedFlow(record, this.context)
      case "water-leak-detector":
      case "rain-sensor":
      case "water-freeze-detector": return new BridgedWaterSensor(record, this.context)
      case "generic-switch":
      case "doorbell": return new BridgedButton(record, this.context)
      case "venetian-blind": return new BridgedBlind(record, this.context)
      case "color-light": return new BridgedRgbLight(record, this.context)
      case "water-valve": return new BridgedValve(record, this.context)
      case "air-quality-sensor": return new BridgedAirQuality(record, this.context)
      case "thermostat-heat-cool": return new BridgedClimate(record, this.context)
    }
  }
}
