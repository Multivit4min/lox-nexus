import type { Rgbw, ValueOf } from "@lox-nexus/plugin-sdk/values"
import type { EntityState } from "../entities/EntityStore.ts"
import { LightState } from "../entities/LightState.ts"
import { EntityActuator } from "./EntityActuator.ts"

const COLOR_MODES = ["rgb", "rgbw", "rgbww", "hs", "xy"]

/**
 * Sets a light's colour from RGBW. Loxone's channels carry the brightness, Home Assistant wants
 * the colour at full brightness plus a brightness, so the brightest channel becomes the
 * brightness. Lights without a white channel get the white mixed into red, green and blue. All
 * channels at 0 turns the light off.
 */
export class LightColorActuator extends EntityActuator<ValueOf<"rgbw">> {
  static readonly id = "lightColor"
  static readonly label = "Light colour"
  static readonly accepts = "rgbw"
  static readonly domains = ["light"]
  static readonly concurrency = "latest"

  static supports(entity: EntityState) {
    return new LightState(entity).modes.some(mode => COLOR_MODES.includes(mode))
  }

  static current(entity: EntityState) {
    const value = new LightState(entity).color()
    return value && { value }
  }

  async run({ value }: ValueOf<"rgbw">) {
    const transition = EntityActuator.transition(value.fadeTime)
    const data = this.serviceData(value)
    if (!data) await this.call("turn_off", transition)
    else await this.call("turn_on", { ...data, ...transition })
  }

  /** undefined for black (off) */
  private serviceData({ red, green, blue, white }: Rgbw): Record<string, unknown> | undefined {
    const withWhite = this.entity ? new LightState(this.entity).modes.includes("rgbw") : false
    const channels = withWhite ? [red, green, blue, white] : [red, green, blue].map(channel => Math.min(100, channel + white))
    const brightest = Math.max(...channels)
    if (brightest === 0) return undefined
    const color = channels.map(channel => Math.round(channel / brightest * 255))
    return { [withWhite ? "rgbw_color" : "rgb_color"]: color, brightness_pct: brightest }
  }
}
