/** what a controller (Alexa, Google, …) can command on a device; each becomes a sensor */
export type CommandKind = "onOff" | "brightness" | "position" | "setpoint"

/** what Nexus can tell controllers about a device; each becomes an actuator */
export type StateKind = "onOff" | "brightness" | "position" | "temperature" | "humidity" | "contact" | "occupancy" | "setpoint"

/** a value of either: on/off, contact and occupancy are booleans, the rest numbers */
export type KindValue = boolean | number

/** the device types the bridge offers, as stored in the config */
export const DEVICE_TYPE_IDS = [
  "on-off-light", "dimmable-light", "plug", "window-covering", "thermostat",
  "temperature-sensor", "humidity-sensor", "contact-sensor", "occupancy-sensor"
] as const

export type DeviceTypeId = typeof DEVICE_TYPE_IDS[number]
