import type { CommandKind, DeviceTypeId, StateKind } from "../devices/DeviceKinds.ts"

/** how a device type shows in forms and the panel, and which signals fit it */
export interface DeviceTypeInfo {
  readonly label: string
  readonly commands: readonly CommandKind[]
  readonly states: readonly StateKind[]
}

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
    "window-covering": { label: "Window covering (lift position)", commands: ["position"], states: ["position"] },
    "thermostat": { label: "Thermostat (heating)", commands: ["setpoint"], states: ["temperature", "setpoint"] },
    "fan": { label: "Fan", commands: ["onOff", "fanSpeed"], states: ["onOff", "fanSpeed"] },
    "door-lock": { label: "Door lock", commands: ["lock"], states: ["locked"] },
    "temperature-sensor": { label: "Temperature sensor", commands: [], states: ["temperature"] },
    "humidity-sensor": { label: "Humidity sensor", commands: [], states: ["humidity"] },
    "contact-sensor": { label: "Contact sensor (door, window)", commands: [], states: ["contact"] },
    "occupancy-sensor": { label: "Motion (occupancy) sensor", commands: [], states: ["occupancy"] },
    "smoke-co-alarm": { label: "Smoke and CO alarm", commands: [], states: ["smoke", "co"] },
    "water-leak-detector": { label: "Water leak detector", commands: [], states: ["leak"] },
    "generic-switch": { label: "Button (generic switch)", commands: [], states: ["press", "longPress"] }
  }

  static info(type: DeviceTypeId) {
    return DeviceTypes.all[type]
  }

  /** the form's labels for the type choice */
  static labels() {
    return Object.fromEntries(Object.entries(DeviceTypes.all).map(([id, info]) => [id, info.label]))
  }
}
