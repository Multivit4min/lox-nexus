import type { CommandKind, KindValue, StateKind } from "../devices/DeviceKinds.ts"

/** Commands and states as the panel and messages show them: "on", "45 %", "21.5 °C", "open". */
export class KindFormat {
  static readonly LABELS: Readonly<Record<StateKind, string>> = {
    onOff: "on/off", brightness: "brightness", position: "position", setpoint: "heating setpoint",
    temperature: "temperature", humidity: "humidity", contact: "contact", occupancy: "occupancy"
  }

  static label(kind: StateKind | CommandKind) {
    return KindFormat.LABELS[kind]
  }

  static value(kind: StateKind, value: KindValue) {
    if (typeof value === "boolean") return KindFormat.flag(kind, value)
    const number = Number.isInteger(value) ? String(value) : value.toFixed(1)
    return kind === "temperature" || kind === "setpoint" ? `${number} °C` : `${number} %`
  }

  /** with the kind in front, for devices with more than one ("heating setpoint 21 °C"); on, off, open say enough */
  static labeled(kind: StateKind, value: KindValue) {
    const text = KindFormat.value(kind, value)
    return typeof value === "boolean" ? text : `${KindFormat.label(kind)} ${text}`
  }

  private static flag(kind: StateKind, value: boolean) {
    if (kind === "contact") return value ? "open" : "closed"
    if (kind === "occupancy") return value ? "occupied" : "clear"
    return value ? "on" : "off"
  }
}
