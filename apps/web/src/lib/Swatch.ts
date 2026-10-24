import type { Value } from "@lox-nexus/plugin-sdk/values"

/** The CSS colour of a value's swatch: RGBW and colour temperatures get one, other values none. */
export class Swatch {
  static of(value: Value | undefined): string | undefined {
    if (value?.type === "rgbw") {
      // the white channel lightens every colour; without it a pure-white mood (w80) would look black
      const { red, green, blue, white } = value.value
      const channel = (level: number) => Math.min(100, level + white) * 2.55
      return `rgb(${channel(red)} ${channel(green)} ${channel(blue)})`
    }
    if (value?.type === "tunableWhite") {
      const [red, green, blue] = Swatch.kelvin(value.value.temperature)
      // dimmed towards black with the brightness, but never invisible
      const level = 0.25 + 0.75 * value.value.brightness / 100
      return `rgb(${Math.round(red * level)} ${Math.round(green * level)} ${Math.round(blue * level)})`
    }
    return undefined
  }

  /** an approximate sRGB colour of a black body (Tanner Helland's fit), good enough for a swatch */
  static kelvin(kelvin: number): [number, number, number] {
    const t = Math.min(40000, Math.max(1000, kelvin)) / 100
    const clamp = (x: number) => Math.round(Math.min(255, Math.max(0, x)))
    const red = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592
    const green = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492
    const blue = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
    return [clamp(red), clamp(green), clamp(blue)]
  }
}
