import type { DeviceConfig } from "../config/BridgeConfig.ts"
import type { BridgedDevice, DeviceContext } from "./BridgedDevice.ts"
import { BridgedContact } from "./BridgedContact.ts"
import { BridgedCover } from "./BridgedCover.ts"
import { BridgedDimmer } from "./BridgedDimmer.ts"
import { BridgedHumidity } from "./BridgedHumidity.ts"
import { BridgedOccupancy } from "./BridgedOccupancy.ts"
import { BridgedSwitch } from "./BridgedSwitch.ts"
import { BridgedTemperature } from "./BridgedTemperature.ts"
import { BridgedThermostat } from "./BridgedThermostat.ts"

/** Builds the bridged device for a configured one. */
export class DeviceFactory {
  constructor(private readonly context: DeviceContext) {}

  create(config: DeviceConfig): BridgedDevice {
    switch (config.type) {
      case "on-off-light":
      case "plug": return new BridgedSwitch(config, this.context)
      case "dimmable-light": return new BridgedDimmer(config, this.context)
      case "window-covering": return new BridgedCover(config, this.context)
      case "thermostat": return new BridgedThermostat(config, this.context)
      case "temperature-sensor": return new BridgedTemperature(config, this.context)
      case "humidity-sensor": return new BridgedHumidity(config, this.context)
      case "contact-sensor": return new BridgedContact(config, this.context)
      case "occupancy-sensor": return new BridgedOccupancy(config, this.context)
    }
  }
}
