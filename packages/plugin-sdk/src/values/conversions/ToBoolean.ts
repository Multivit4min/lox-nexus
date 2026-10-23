import { Value, type ValueOf } from "../Value.ts"
import { Conversion } from "./Conversion.ts"

export class ToBoolean extends Conversion<"boolean"> {
  readonly target = "boolean"

  /** states other systems (mostly Home Assistant) report for "on" */
  static readonly TRUTHY = new Set([
    "on", "true", "1", "ok", "active", "open", "opening", "unlocked", "unlocking", "running", "armed", "arming",
    "playing", "buffering", "heating", "cooling", "drying", "fan", "above_horizon", "cleaning", "returning"
  ])

  protected from(value: Value): ValueOf<"boolean"> {
    switch (value.type) {
      case "number": return Value.boolean(value.value !== 0 && !Number.isNaN(value.value))
      case "string": return Value.boolean(ToBoolean.TRUTHY.has(value.value.trim().toLowerCase()))
      case "singleChannel": return Value.boolean(value.value.channel !== 0)
      case "rgbw": {
        const { red, green, blue, white } = value.value
        return Value.boolean(red + green + blue + white !== 0)
      }
      case "tunableWhite": return Value.boolean(value.value.brightness > 0)
      case "t5": return Value.boolean(value.value.buttons !== 0)
      default: return this.fallback()
    }
  }
}
