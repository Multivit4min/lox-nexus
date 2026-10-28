import type { WatchedSignal, WatchedValue } from "@lox-nexus/plugin-sdk"
import type { Value } from "@lox-nexus/plugin-sdk/values"
import type { FieldValue, Point } from "./LineProtocol.ts"

/** Which optional tags points carry; `signal_id` and `value_type` are always there. */
export interface MapperOptions {
  measurement: string
  tagTopic: boolean
  tagLabel: boolean
  tagOwner: boolean
}

/**
 * Turns a watched value into a point. Every value type has its own fixed field names, and a field
 * name always has the same type (`value` is always a float, `text` always a string), so a signal
 * whose type changes, or two signals of different types, can never cause a field type conflict
 * in InfluxDB.
 *
 * | Value | Fields |
 * |---|---|
 * | number, boolean (0/1), t5 (buttons) | `value` |
 * | string | `text` |
 * | singleChannel | `brightness`, `fade_time` |
 * | tunableWhite | `brightness`, `temperature`, `fade_time` |
 * | rgbw | `red`, `green`, `blue`, `white`, `fade_time` |
 *
 * Null values have nothing to write and give no point. Forced values also get `forced=true`.
 */
export class PointMapper {
  constructor(private readonly options: MapperOptions) {}

  /** the point for a value, or undefined for a null value */
  map(value: WatchedValue, signal: WatchedSignal): Point | undefined {
    const fields = PointMapper.fields(value.value)
    if (!fields) return undefined
    if (value.forced) fields.forced = true
    return { measurement: this.options.measurement, tags: this.tags(value, signal), fields, ts: value.ts }
  }

  /** the fields of a value type, or undefined for null */
  static fields(value: Value): Record<string, FieldValue> | undefined {
    switch (value.type) {
      case "null": return undefined
      case "number": return { value: value.value }
      case "boolean": return { value: value.value ? 1 : 0 }
      case "t5": return { value: value.value.buttons }
      case "string": return { text: value.value }
      case "singleChannel": return { brightness: value.value.channel, fade_time: value.value.fadeTime }
      case "tunableWhite": {
        const { brightness, temperature, fadeTime } = value.value
        return { brightness, temperature, fade_time: fadeTime }
      }
      case "rgbw": {
        const { red, green, blue, white, fadeTime } = value.value
        return { red, green, blue, white, fade_time: fadeTime }
      }
    }
  }

  private tags(value: WatchedValue, signal: WatchedSignal) {
    const tags: Record<string, string> = { signal_id: value.signalId, value_type: value.value.type }
    if (this.options.tagTopic) tags.topic = signal.topic
    if (this.options.tagLabel) tags.label = signal.label
    if (this.options.tagOwner && signal.owner) tags.owner = `${signal.owner.kind}:${signal.owner.id}`
    return tags
  }
}
