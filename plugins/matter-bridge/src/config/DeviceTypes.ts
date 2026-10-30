import type { CommandKind, DeviceTypeId, StateKind } from "../devices/DeviceKinds.ts"

/** how a device type shows in the form and the panel, and which signals fit it */
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
    "plug": { label: "Plug (on/off)", commands: ["onOff"], states: ["onOff"] },
    "window-covering": { label: "Window covering (lift position)", commands: ["position"], states: ["position"] },
    "thermostat": { label: "Thermostat (heating)", commands: ["setpoint"], states: ["temperature", "setpoint"] },
    "temperature-sensor": { label: "Temperature sensor", commands: [], states: ["temperature"] },
    "humidity-sensor": { label: "Humidity sensor", commands: [], states: ["humidity"] },
    "contact-sensor": { label: "Contact sensor (door, window)", commands: [], states: ["contact"] },
    "occupancy-sensor": { label: "Motion (occupancy) sensor", commands: [], states: ["occupancy"] }
  }

  static info(type: DeviceTypeId) {
    return DeviceTypes.all[type]
  }

  /** the form's labels for the type choice */
  static labels() {
    return Object.fromEntries(Object.entries(DeviceTypes.all).map(([id, info]) => [id, info.label]))
  }
}
