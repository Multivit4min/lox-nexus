import { Numbers } from "./Numbers.ts"

/** A dimmer-like channel, as carried by Loxone's Smart Actuator single channel. */
export interface SingleChannel {
  /** 0–100 */
  channel: number
  /** seconds */
  fadeTime: number
}

/** Four colour channels with a fade time, as carried by Loxone's Smart Actuator RGBW. */
export interface Rgbw {
  /** 0–100 */
  red: number
  green: number
  blue: number
  white: number
  /** seconds */
  fadeTime: number
  /** @experimental raw flag bits; 0x4000 marks lighting sequence steps */
  flags: number
}

/** Tunable white light: colour temperature plus brightness. */
export interface TunableWhite {
  /** Kelvin; conversions keep it within 2700–6500 */
  temperature: number
  /** 0–100 */
  brightness: number
  /** seconds */
  fadeTime: number
}

/** State of a Loxone Touch/T5 button panel. */
export interface T5 {
  /** bitmask of pressed buttons, see T5Buttons; buttons pressed together are added */
  buttons: number
}

/**
 * Every value that flows over the bus. A closed union of plain data, so it survives worker and
 * network boundaries and can be compared structurally.
 */
export type Value =
  | { type: "null" }
  | { type: "boolean"; value: boolean }
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "singleChannel"; value: SingleChannel }
  | { type: "rgbw"; value: Rgbw }
  | { type: "tunableWhite"; value: TunableWhite }
  | { type: "t5"; value: T5 }

/** The discriminator of Value, e.g. "number". Also what a signal declares as its valueType. */
export type ValueType = Value["type"]
/** The variant of Value for one type, e.g. ValueOf<"rgbw">. */
export type ValueOf<T extends ValueType> = Extract<Value, { type: T }>

/**
 * Factories and helpers, used as `Value.number(3)` or `Value.equals(a, b)`. The factories copy
 * structured payloads so a caller mutating its input cannot change a value already on the bus.
 * They do not validate or round; use ValueSchema for untrusted input and Converter for coercion.
 */
export class ValueFactory {
  /** every value type, in a stable order for UIs and schemas */
  readonly types: readonly ValueType[] = ["null", "boolean", "number", "string", "singleChannel", "rgbw", "tunableWhite", "t5"]

  null(): ValueOf<"null"> {
    return { type: "null" }
  }

  boolean(value: boolean): ValueOf<"boolean"> {
    return { type: "boolean", value }
  }

  number(value: number): ValueOf<"number"> {
    return { type: "number", value }
  }

  string(value: string): ValueOf<"string"> {
    return { type: "string", value }
  }

  /** structured factories normalise to wire resolution: whole percent (clamped 0–100), 0.1 s fades */
  singleChannel(value: SingleChannel): ValueOf<"singleChannel"> {
    return { type: "singleChannel", value: { channel: Numbers.percent(value.channel), fadeTime: Numbers.fade(value.fadeTime) } }
  }

  rgbw(value: Rgbw): ValueOf<"rgbw"> {
    const { red, green, blue, white, fadeTime, flags } = value
    return { type: "rgbw", value: {
      red: Numbers.percent(red), green: Numbers.percent(green), blue: Numbers.percent(blue), white: Numbers.percent(white),
      fadeTime: Numbers.fade(fadeTime), flags: Math.round(Numbers.clamp(flags, 0, 0xffff, 0))
    } }
  }

  tunableWhite(value: TunableWhite): ValueOf<"tunableWhite"> {
    const temperature = Math.round(Numbers.clamp(value.temperature, 0, 0xffff, 4000))
    return { type: "tunableWhite", value: { temperature, brightness: Numbers.percent(value.brightness), fadeTime: Numbers.fade(value.fadeTime) } }
  }

  /** masks outside 0–31 or non-integers become 0 (no button) */
  t5(value: T5): ValueOf<"t5"> {
    const valid = Number.isInteger(value.buttons) && value.buttons >= 0 && value.buttons <= 31
    return { type: "t5", value: { buttons: valid ? value.buttons : 0 } }
  }

  /** type guard for strings from outside (HTTP, config) */
  isType(type: string): type is ValueType {
    return (this.types as readonly string[]).includes(type)
  }

  /** structural equality; 0 equals -0, and NaN equals NaN so repeated NaN readings dedupe */
  equals(a: Value | undefined, b: Value | undefined): boolean {
    if (a === undefined || b === undefined) return a === b
    if (a.type !== b.type) return false
    if (a.type === "null") return true
    const left: unknown = a.value
    const right: unknown = (b as typeof a).value
    if (typeof left !== "object" || left === null) return ValueFactory.same(left, right)
    const l = left as Record<string, unknown>
    const r = right as Record<string, unknown>
    const keys = Object.keys(l)
    return keys.length === Object.keys(r).length && keys.every(key => ValueFactory.same(l[key], r[key]))
  }

  private static same(a: unknown, b: unknown) {
    return a === b || (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b))
  }
}

/**
 * Factories and helpers for values: `Value.number(3)`, `Value.boolean(true)`,
 * `Value.rgbw({ ... })`, `Value.equals(a, b)`. `Value` is also the union type of all values, so
 * the same name works in type positions (`emit(value: Value)`).
 */
export const Value = new ValueFactory()
