/** what a controller (Alexa, Google, …) can command on a device; each becomes a sensor */
export type CommandKind = "onOff" | "brightness" | "colorTemperature" | "tunableWhite" | "position" | "setpoint" | "fanSpeed" | "lock"

/** what Nexus can tell controllers about a device; each becomes an actuator */
export type StateKind =
  | "onOff" | "brightness" | "colorTemperature" | "tunableWhite" | "position" | "setpoint" | "fanSpeed"
  | "temperature" | "humidity" | "contact" | "occupancy" | "locked" | "smoke" | "co" | "leak" | "press" | "longPress"
  | "illuminance" | "pressure" | "flow" | "rain" | "freeze" | "battery"

/** a tunable white light's colour temperature (Kelvin) and brightness (%) */
export interface TunableWhiteValue { temperature: number; brightness: number }

/** a value of a command or state: on/off-like kinds are booleans, tunable white an object, the rest numbers */
export type KindValue = boolean | number | TunableWhiteValue

/** the device types the bridge offers, as stored with each device */
export const DEVICE_TYPE_IDS = [
  "on-off-light", "dimmable-light", "color-temperature-light", "plug", "window-covering", "thermostat", "fan", "door-lock",
  "temperature-sensor", "humidity-sensor", "contact-sensor", "occupancy-sensor", "smoke-co-alarm", "water-leak-detector", "generic-switch",
  "light-sensor", "pressure-sensor", "flow-sensor", "rain-sensor", "water-freeze-detector", "dimmable-plug", "wall-switch", "wall-dimmer"
] as const

export type DeviceTypeId = typeof DEVICE_TYPE_IDS[number]
