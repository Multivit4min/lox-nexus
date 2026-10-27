import { Value } from "@lox-nexus/plugin-sdk/values"
import type { EntityState } from "./EntityStore.ts"

/**
 * Reads a light entity's attributes as Loxone-style values. Home Assistant gives brightness
 * as 0–255 and colours as 0–255 channels at full brightness; Loxone's channels are percent with
 * the brightness already in them.
 */
export class LightState {
  constructor(private readonly entity: EntityState) {}

  get on() {
    return this.entity.state === "on"
  }

  /** 0 when off, at least 1 when on (a dim light must not read as off); 100 for an on light without brightness (on/off only) */
  get brightness() {
    if (!this.on) return 0
    const raw = this.entity.attributes.brightness
    return typeof raw === "number" ? Math.max(1, Math.round(raw / 2.55)) : 100
  }

  /** the colour modes the light supports, e.g. ["color_temp", "xy"] */
  get modes(): string[] {
    const modes = this.entity.attributes.supported_color_modes
    return Array.isArray(modes) ? modes.filter(mode => typeof mode === "string") : []
  }

  /** a colour temperature in color_temp mode, otherwise its colour (white only for lights without colour); undefined when off */
  color(): Value | undefined {
    if (!this.on) return undefined
    const { color_mode: mode, color_temp_kelvin: kelvin } = this.entity.attributes
    if (mode === "color_temp" && typeof kelvin === "number") {
      return Value.tunableWhite({ temperature: kelvin, brightness: this.brightness, fadeTime: 0 })
    }
    const channels = this.channels(mode === "rgbw" ? "rgbw_color" : "rgb_color")
    if (!channels) return Value.rgbw({ red: 0, green: 0, blue: 0, white: this.brightness, fadeTime: 0, flags: 0 })
    const [red = 0, green = 0, blue = 0, white = 0] = channels.map(channel => channel / 255 * this.brightness)
    return Value.rgbw({ red, green, blue, white, fadeTime: 0, flags: 0 })
  }

  private channels(attribute: string) {
    const raw = this.entity.attributes[attribute]
    return Array.isArray(raw) && raw.every(channel => typeof channel === "number") ? raw as number[] : undefined
  }
}
