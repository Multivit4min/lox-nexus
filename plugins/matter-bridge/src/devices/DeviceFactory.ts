import type { BridgedDevice, DeviceContext } from "./BridgedDevice.ts"
import { BridgedButton } from "./BridgedButton.ts"
import { BridgedColorLight } from "./BridgedColorLight.ts"
import { BridgedContact } from "./BridgedContact.ts"
import { BridgedCover } from "./BridgedCover.ts"
import { BridgedDimmer } from "./BridgedDimmer.ts"
import { BridgedFan } from "./BridgedFan.ts"
import { BridgedHumidity } from "./BridgedHumidity.ts"
import { BridgedLeak } from "./BridgedLeak.ts"
import { BridgedLock } from "./BridgedLock.ts"
import { BridgedOccupancy } from "./BridgedOccupancy.ts"
import { BridgedSmokeAlarm } from "./BridgedSmokeAlarm.ts"
import { BridgedSwitch } from "./BridgedSwitch.ts"
import { BridgedTemperature } from "./BridgedTemperature.ts"
import { BridgedThermostat } from "./BridgedThermostat.ts"
import type { DeviceRecord } from "./DeviceRecord.ts"

/** Builds the bridged device for a stored one. */
export class DeviceFactory {
  constructor(private readonly context: DeviceContext) {}

  create(record: DeviceRecord): BridgedDevice {
    switch (record.type) {
      case "on-off-light":
      case "plug": return new BridgedSwitch(record, this.context)
      case "dimmable-light": return new BridgedDimmer(record, this.context)
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
      case "water-leak-detector": return new BridgedLeak(record, this.context)
      case "generic-switch": return new BridgedButton(record, this.context)
    }
  }
}
