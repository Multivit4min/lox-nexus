import type { Value } from "@lox-nexus/plugin-sdk/values"

/** How a value is stored: a number for charts and buckets, and text for what a number can't say. */
export interface ProjectedValue {
  num: number | null
  text: string | null
  /** contributes to buckets (min, max, average); text values don't */
  numeric: boolean
}

/** Text is cut here: one value must not bloat the history (webhook texts may be 4096 characters). */
const MAX_TEXT = 1000

/**
 * Turns bus values into stored ones. Lights chart as their brightness, with colour and fade time
 * kept as text; a T5 as its button bitmask; on/off as 0 and 1, so its average is the share of
 * time it was on.
 */
export class ValueProjection {
  static of(value: Value): ProjectedValue {
    switch (value.type) {
      case "number": return ValueProjection.number(value.value)
      case "boolean": return ValueProjection.number(value.value ? 1 : 0)
      case "t5": return ValueProjection.number(value.value.buttons)
      case "singleChannel": return { ...ValueProjection.number(value.value.channel), text: JSON.stringify({ fadeTime: value.value.fadeTime }) }
      case "tunableWhite": {
        const { brightness, temperature, fadeTime } = value.value
        return { ...ValueProjection.number(brightness), text: JSON.stringify({ temperature, fadeTime }) }
      }
      case "rgbw": {
        const { red, green, blue, white } = value.value
        return { ...ValueProjection.number(Math.max(red, green, blue, white)), text: JSON.stringify(value.value) }
      }
      case "string": return { num: null, text: value.value.slice(0, MAX_TEXT), numeric: false }
      case "null": return { num: null, text: null, numeric: true }
    }
  }

  // NaN and infinities can't be charted or averaged; neither can numbers so large that value x
  // milliseconds overflows a bucket's sum. They read as "no value".
  private static number(n: number): ProjectedValue {
    return { num: Math.abs(n) <= ValueProjection.MAX_NUMBER ? n : null, text: null, numeric: true }
  }

  private static readonly MAX_NUMBER = 1e290
}
