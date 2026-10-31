import type { CommandKind, DeviceTypeId, StateKind } from "../devices/DeviceKinds.ts"

/** how a device type shows in forms and the panel, and which signals fit it */
export interface DeviceTypeInfo {
  readonly label: string
  readonly commands: readonly CommandKind[]
  readonly states: readonly StateKind[]
  /** whether a device of this type can report a battery level (chosen when it is added) */
  readonly battery?: true
}

const sensor = (label: string, ...states: StateKind[]): DeviceTypeInfo => ({ label, commands: [], states, battery: true })

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
    "window-covering": { label: "Window covering (lift position)", commands: ["position"], states: ["position"] },
    "thermostat": { label: "Thermostat (heating)", commands: ["setpoint"], states: ["temperature", "setpoint"] },
    "fan": { label: "Fan", commands: ["onOff", "fanSpeed"], states: ["onOff", "fanSpeed"] },
    "door-lock": { label: "Door lock", commands: ["lock"], states: ["locked"] },
    "temperature-sensor": sensor("Temperature sensor", "temperature"),
    "humidity-sensor": sensor("Humidity sensor", "humidity"),
    "contact-sensor": sensor("Contact sensor (door, window)", "contact"),
    "occupancy-sensor": sensor("Motion (occupancy) sensor", "occupancy"),
    "light-sensor": sensor("Light sensor (lux)", "illuminance"),
    "pressure-sensor": sensor("Pressure sensor", "pressure"),
    "flow-sensor": sensor("Flow sensor", "flow"),
    "rain-sensor": sensor("Rain sensor", "rain"),
    "water-freeze-detector": sensor("Water freeze detector", "freeze"),
    "smoke-co-alarm": { label: "Smoke and CO alarm", commands: [], states: ["smoke", "co"] },
    "water-leak-detector": sensor("Water leak detector", "leak"),
    "generic-switch": sensor("Button (generic switch)", "press", "longPress")
  }

  /** a type's info; with a battery, its states end with the battery level */
  static info(type: DeviceTypeId, battery = false): DeviceTypeInfo {
    const info = DeviceTypes.all[type]
    return battery && info.battery ? { ...info, states: [...info.states, "battery"] } : info
  }

  /** the types that can have a battery */
  static withBattery() {
    return (Object.keys(DeviceTypes.all) as DeviceTypeId[]).filter(type => DeviceTypes.all[type].battery)
  }

  /** the form's labels for the type choice */
  static labels() {
    return Object.fromEntries(Object.entries(DeviceTypes.all).map(([id, info]) => [id, info.label]))
  }
}
