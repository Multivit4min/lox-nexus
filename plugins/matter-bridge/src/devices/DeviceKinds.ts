/** what a controller (Alexa, Google, …) can command on a device; each becomes a sensor */
export type CommandKind =
  | "onOff" | "brightness" | "colorTemperature" | "tunableWhite" | "position" | "setpoint" | "fanSpeed" | "lock"
  | "tilt" | "color" | "coolingSetpoint" | "mode" | "valve"

/** what Nexus can tell controllers about a device; each becomes an actuator */
export type StateKind =
  | "onOff" | "brightness" | "colorTemperature" | "tunableWhite" | "position" | "setpoint" | "fanSpeed"
  | "temperature" | "humidity" | "contact" | "occupancy" | "locked" | "smoke" | "co" | "leak" | "press" | "longPress"
  | "illuminance" | "pressure" | "flow" | "rain" | "freeze" | "battery"
  | "tilt" | "color" | "coolingSetpoint" | "mode" | "valve" | "airQuality" | "co2" | "pm25"

/** a tunable white light's colour temperature (Kelvin) and brightness (%) */
export interface TunableWhiteValue { temperature: number; brightness: number }

/** a colour light's red, green and blue in % (brightness included), as a Loxone RGBW actuator takes them */
export interface ColorValue { red: number; green: number; blue: number }

/** a thermostat's mode, as Nexus sends and gets it */
export type ThermostatMode = "off" | "heat" | "cool" | "auto"

/**
 * a value of a command or state: on/off-like kinds are booleans, tunable white and colour objects,
 * a thermostat's mode a string, the rest numbers
 */
export type KindValue = boolean | number | string | TunableWhiteValue | ColorValue

/** the device types the bridge offers, as stored with each device, in the order the Add device form lists them */
export const DEVICE_TYPE_IDS = [
  "on-off-light", "dimmable-light", "color-temperature-light", "color-light",
  "plug", "dimmable-plug", "wall-switch", "wall-dimmer",
  "window-covering", "venetian-blind", "thermostat", "thermostat-heat-cool", "fan", "water-valve", "door-lock",
  "temperature-sensor", "humidity-sensor", "light-sensor", "pressure-sensor", "flow-sensor", "air-quality-sensor",
  "contact-sensor", "occupancy-sensor", "smoke-co-alarm", "water-leak-detector", "rain-sensor", "water-freeze-detector",
  "generic-switch", "doorbell"
] as const

export type DeviceTypeId = typeof DEVICE_TYPE_IDS[number]
