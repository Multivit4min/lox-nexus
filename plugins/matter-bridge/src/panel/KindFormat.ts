import { AirQualityLevel } from "../devices/AirQualityLevel.ts"
import { ChimeServer } from "../devices/ChimeServer.ts"
import type { CommandKind, KindValue, StateKind } from "../devices/DeviceKinds.ts"

type Kind = StateKind | CommandKind

const UNITS: Partial<Record<Kind, string>> = {
  temperature: "°C", setpoint: "°C", coolingSetpoint: "°C", colorTemperature: "K", illuminance: "lx", pressure: "hPa", flow: "m³/h",
  co2: "ppm", pm25: "µg/m³", power: "W", production: "W", energyImported: "kWh", energyExported: "kWh", voltage: "V", current: "A",
  maxCurrent: "A", sessionEnergy: "kWh"
}
const FLAGS: Partial<Record<Kind, [string, string]>> = {
  contact: ["open", "closed"], occupancy: ["occupied", "clear"], locked: ["locked", "unlocked"], lock: ["lock", "unlock"],
  smoke: ["smoke alarm", "no smoke"], co: ["CO alarm", "no CO"], leak: ["leak", "dry"], press: ["pressed", "released"],
  longPress: ["long press", "released"], rain: ["rain", "dry"], freeze: ["frost", "no frost"],
  valve: ["open", "closed"], pluggedIn: ["plugged in", "no car"], charging: ["charging", "not charging"],
  chargingEnabled: ["charging enabled", "charging disabled"], ring: ["ringing", "quiet"], chimeEnabled: ["chime on", "chime off"]
}

/** Commands and states as the panel and messages show them: "on", "45 %", "21.5 °C", "open". */
export class KindFormat {
  static readonly LABELS: Readonly<Record<Kind, string>> = {
    onOff: "on/off", brightness: "brightness", colorTemperature: "colour temperature", tunableWhite: "tunable white",
    position: "position", setpoint: "heating setpoint", fanSpeed: "speed", lock: "lock", temperature: "temperature",
    humidity: "humidity", contact: "contact", occupancy: "occupancy", locked: "locked", smoke: "smoke", co: "CO",
    leak: "leak", press: "press", longPress: "long press", illuminance: "illuminance", pressure: "pressure", flow: "flow",
    rain: "rain", freeze: "frost", battery: "battery", tilt: "slat angle", color: "colour", coolingSetpoint: "cooling setpoint",
    mode: "mode", valve: "valve", airQuality: "air quality", co2: "CO₂", pm25: "PM2.5", power: "power", production: "PV power",
    energyImported: "energy imported", energyExported: "energy exported", voltage: "voltage", current: "current", pluggedIn: "car",
    charging: "charging", chargingEnabled: "charging enabled", maxCurrent: "maximum current", sessionEnergy: "session energy",
    chargingMode: "charging mode", ring: "ring", chimeSound: "chime sound", chimeEnabled: "chime"
  }

  static label(kind: Kind) {
    return KindFormat.LABELS[kind]
  }

  static value(kind: Kind, value: KindValue) {
    if (typeof value === "object") {
      if ("red" in value) return `R ${Math.round(value.red)} G ${Math.round(value.green)} B ${Math.round(value.blue)} %`
      return `${Math.round(value.temperature)} K, ${KindFormat.number(value.brightness)} %`
    }
    if (typeof value === "string") return value
    if (typeof value === "boolean") {
      const [yes, no] = FLAGS[kind] ?? ["on", "off"]
      return value ? yes : no
    }
    if (kind === "airQuality") return AirQualityLevel.NAMES[value] ?? String(value)
    if (kind === "chimeSound") return `${value} (${ChimeServer.soundName(value)})`
    return `${KindFormat.number(value)} ${UNITS[kind] ?? "%"}`
  }

  /** with the kind in front, for devices with more than one ("heating setpoint 21 °C"); on, off, open say enough */
  static labeled(kind: Kind, value: KindValue) {
    const text = KindFormat.value(kind, value)
    return typeof value === "boolean" ? text : `${KindFormat.label(kind)} ${text}`
  }

  private static number(value: number) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1)
  }
}
