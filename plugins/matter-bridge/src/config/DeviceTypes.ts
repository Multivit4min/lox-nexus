import { DEVICE_TYPE_IDS, type CommandKind, type DeviceTypeId, type StateKind } from "../devices/DeviceKinds.ts"

/** how a device type shows in forms and the panel, and which signals fit it */
export interface DeviceTypeInfo {
  readonly label: string
  readonly commands: readonly CommandKind[]
  readonly states: readonly StateKind[]
  /** whether a device of this type can report a battery level (chosen when it is added) */
  readonly battery?: true
}

/** a type with states only, which may run on a battery: sensors and buttons */
const battery = (label: string, ...states: StateKind[]): DeviceTypeInfo => ({ label, commands: [], states, battery: true })

/** The device types of the bridge: their labels and the commands and states each one has. */
export class DeviceTypes {
  static readonly all: Readonly<Record<DeviceTypeId, DeviceTypeInfo>> = {
    "on-off-light": { label: "On/off light", commands: ["onOff"], states: ["onOff"] },
    "dimmable-light": { label: "Dimmable light", commands: ["onOff", "brightness"], states: ["onOff", "brightness"] },
    "color-temperature-light": {
      label: "Tunable white light",
      commands: ["onOff", "brightness", "colorTemperature", "tunableWhite"],
      states: ["onOff", "brightness", "colorTemperature", "tunableWhite"]
    },
    "plug": { label: "Plug (on/off)", commands: ["onOff"], states: ["onOff"] },
    "dimmable-plug": { label: "Dimmable plug", commands: ["onOff", "brightness"], states: ["onOff", "brightness"] },
    "wall-switch": { label: "Wall switch (on/off)", commands: ["onOff"], states: ["onOff"] },
    "wall-dimmer": { label: "Wall dimmer", commands: ["onOff", "brightness"], states: ["onOff", "brightness"] },
    "color-light": {
      label: "Colour light (RGB)",
      commands: ["onOff", "brightness", "colorTemperature", "color"],
      states: ["onOff", "brightness", "colorTemperature", "color"]
    },
    "window-covering": { label: "Window covering (lift position)", commands: ["position"], states: ["position"] },
    "venetian-blind": { label: "Blind with slats (lift and tilt)", commands: ["position", "tilt"], states: ["position", "tilt"] },
    "thermostat": { label: "Thermostat (heating)", commands: ["setpoint"], states: ["temperature", "setpoint"] },
    "thermostat-heat-cool": {
      label: "Thermostat (heating and cooling)",
      commands: ["setpoint", "coolingSetpoint", "mode"],
      states: ["temperature", "setpoint", "coolingSetpoint", "mode"]
    },
    "fan": { label: "Fan", commands: ["onOff", "fanSpeed"], states: ["onOff", "fanSpeed"] },
    "door-lock": { label: "Door lock", commands: ["lock"], states: ["locked"] },
    "water-valve": { label: "Water valve", commands: ["valve"], states: ["valve"] },
    "temperature-sensor": battery("Temperature sensor", "temperature"),
    "humidity-sensor": battery("Humidity sensor", "humidity"),
    "contact-sensor": battery("Contact sensor (door, window)", "contact"),
    "occupancy-sensor": battery("Motion (occupancy) sensor", "occupancy"),
    "light-sensor": battery("Light sensor (lux)", "illuminance"),
    "pressure-sensor": battery("Pressure sensor", "pressure"),
    "flow-sensor": battery("Flow sensor", "flow"),
    "rain-sensor": battery("Rain sensor", "rain"),
    "water-freeze-detector": battery("Water freeze detector", "freeze"),
    "air-quality-sensor": battery("Air quality sensor", "airQuality", "co2", "pm25"),
    "smoke-co-alarm": { label: "Smoke and CO alarm", commands: [], states: ["smoke", "co"] },
    "water-leak-detector": battery("Water leak detector", "leak"),
    "generic-switch": battery("Button (generic switch)", "press", "longPress"),
    "doorbell": battery("Doorbell", "press"),
    "electrical-meter": { label: "Electricity meter", commands: [], states: ["power", "energyImported", "energyExported", "voltage", "current"] },
    "solar-power": { label: "Solar power (PV)", commands: [], states: ["production", "energyExported"] },
    "battery-storage": { label: "Battery storage", commands: [], states: ["power", "battery", "energyImported", "energyExported"] },
    "evse": {
      label: "Wallbox (EV charger)",
      commands: ["chargingEnabled", "maxCurrent", "chargingMode"],
      states: ["pluggedIn", "charging", "chargingEnabled", "maxCurrent", "chargingMode", "power", "energyImported", "sessionEnergy"]
    },
    "heat-pump": {
      label: "Heat pump",
      commands: ["setpoint", "coolingSetpoint", "mode"],
      states: ["temperature", "setpoint", "coolingSetpoint", "mode", "power", "energyImported"]
    }
  }

  /** a type's info; with a battery, its states end with the battery level */
  static info(type: DeviceTypeId, battery = false): DeviceTypeInfo {
    const info = DeviceTypes.all[type]
    return battery && info.battery ? { ...info, states: [...info.states, "battery"] } : info
  }

  /** the types that can have a battery */
  static withBattery() {
    return DEVICE_TYPE_IDS.filter(type => DeviceTypes.all[type].battery)
  }

  /** the form's labels for the type choice */
  static labels() {
    return Object.fromEntries(Object.entries(DeviceTypes.all).map(([id, info]) => [id, info.label]))
  }
}
