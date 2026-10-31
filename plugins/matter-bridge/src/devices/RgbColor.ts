import { hsvToRgb, miredsToXy, rgbToHsv, xyToRgb } from "@matter/main/behaviors/color-control"
import { ColorControl } from "@matter/main/clusters/color-control"
import type { ColorValue } from "./DeviceKinds.ts"

/** the ColorControl attributes a colour is read from */
export interface ColorState {
  colorMode: ColorControl.ColorMode
  currentHue?: number
  currentSaturation?: number
  currentX?: number
  currentY?: number
  colorTemperatureMireds?: number
}

/**
 * A colour light's colour as Nexus counts it (red, green and blue in %, brightness included, as a
 * Loxone RGBW actuator takes it) and as Matter does: hue and saturation 0–254, CIE x/y in 1/65536,
 * or a colour temperature. The conversions are matter.js's own.
 */
export class RgbColor {
  static readonly MAX = 254

  /** the colour a light shows at a brightness in %, from whichever mode it is in; a white light as its RGB */
  static of(state: ColorState, brightness: number): ColorValue {
    const [red, green, blue] = RgbColor.full(state)
    const scale = brightness / 100 / Math.max(red, green, blue, 1e-9)
    const percent = (channel: number) => Math.round(Math.min(1, channel * scale) * 100)
    return { red: percent(red), green: percent(green), blue: percent(blue) }
  }

  /** a colour from Nexus as Matter's hue and saturation, and its brightness in % (the brightest channel) */
  static toHueSaturation(color: ColorValue) {
    const [hue, saturation, value] = rgbToHsv(...[color.red, color.green, color.blue].map(RgbColor.unit) as [number, number, number])
    return {
      currentHue: Math.round(hue / 360 * RgbColor.MAX) % (RgbColor.MAX + 1),
      currentSaturation: Math.round(saturation * RgbColor.MAX),
      brightness: Math.round(value * 100)
    }
  }

  /** the colour at full brightness, each channel 0–1 */
  private static full(state: ColorState): [number, number, number] {
    const { ColorMode } = ColorControl
    if (state.colorMode === ColorMode.CurrentXAndCurrentY) return xyToRgb((state.currentX ?? 0) / 65536, (state.currentY ?? 0) / 65536)
    if (state.colorMode === ColorMode.ColorTemperatureMireds) {
      const [x, y] = miredsToXy(state.colorTemperatureMireds ?? 250) ?? [0.3127, 0.329]
      return xyToRgb(x, y)
    }
    return hsvToRgb((state.currentHue ?? 0) / RgbColor.MAX * 360, (state.currentSaturation ?? 0) / RgbColor.MAX)
  }

  private static unit(percent: number) {
    return Math.min(100, Math.max(0, percent)) / 100
  }
}
