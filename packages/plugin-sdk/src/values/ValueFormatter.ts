import { T5Buttons } from "./T5Buttons.ts"
import type { Value } from "./Value.ts"

/**
 * Short human-readable rendering, shared by the bus inspector, logs and the CLI:
 * `42`, `true`, `"eco"` (strings are quoted), `60% 0.2s`, `2700K 80% 2s`, `t5[left-upper+middle]`.
 */
export class ValueFormatter {
  /**
   * Lossy by design (numbers round to 3 decimals): for display only, never parse the result.
   * undefined gives an empty string.
   * @param options.decimals a number value is shown with exactly this many decimals (a signal's display setting)
   */
  format(value: Value | undefined, options: { decimals?: number | undefined } = {}): string {
    if (value === undefined) return ""
    switch (value.type) {
      case "null": return "null"
      case "boolean": return String(value.value)
      case "number": return options.decimals === undefined ? this.number(value.value) : this.fixed(value.value, options.decimals)
      case "string": return JSON.stringify(value.value)
      case "singleChannel": return `${this.number(value.value.channel)}% ${this.number(value.value.fadeTime)}s`
      case "rgbw": {
        const { red, green, blue, white, fadeTime, flags } = value.value
        const base = `r${red} g${green} b${blue} w${white} ${this.number(fadeTime)}s`
        return flags ? `${base} flags 0x${flags.toString(16).padStart(4, "0")}` : base
      }
      case "tunableWhite": return `${value.value.temperature}K ${this.number(value.value.brightness)}% ${this.number(value.value.fadeTime)}s`
      case "t5": return `t5[${new T5Buttons(value.value.buttons).toString()}]`
    }
  }

  // "-0.0" for a tiny negative number reads like a sign error
  private fixed(value: number, decimals: number) {
    const text = value.toFixed(Math.max(0, Math.min(decimals, 6)))
    return /^-0\.?0*$/.test(text) ? text.slice(1) : text
  }

  private number(value: number) {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000)
  }
}
