export interface SingleChannel {
  /** 0–100 */
  channel: number
  /** seconds */
  fadeTime: number
}

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

export interface TunableWhite {
  /** Kelvin */
  temperature: number
  /** 0–100 */
  brightness: number
  /** seconds */
  fadeTime: number
}

export interface T5 {
  /** @experimental bitmask of pressed buttons, see T5Buttons */
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

export type ValueType = Value["type"]
export type ValueOf<T extends ValueType> = Extract<Value, { type: T }>

/** Factories and helpers, used as `Value.number(3)` or `Value.equals(a, b)`. */
export class ValueFactory {
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

  singleChannel(value: SingleChannel): ValueOf<"singleChannel"> {
    return { type: "singleChannel", value: { ...value } }
  }

  rgbw(value: Rgbw): ValueOf<"rgbw"> {
    return { type: "rgbw", value: { ...value } }
  }

  tunableWhite(value: TunableWhite): ValueOf<"tunableWhite"> {
    return { type: "tunableWhite", value: { ...value } }
  }

  t5(value: T5): ValueOf<"t5"> {
    return { type: "t5", value: { ...value } }
  }

  isType(type: string): type is ValueType {
    return (this.types as readonly string[]).includes(type)
  }

  /** structural equality; NaN equals NaN so repeated NaN readings dedupe */
  equals(a: Value | undefined, b: Value | undefined): boolean {
    if (a === undefined || b === undefined) return a === b
    if (a.type !== b.type) return false
    if (a.type === "null") return true
    const left: unknown = a.value
    const right: unknown = (b as typeof a).value
    if (typeof left !== "object" || left === null) return Object.is(left, right)
    const l = left as Record<string, unknown>
    const r = right as Record<string, unknown>
    const keys = Object.keys(l)
    return keys.length === Object.keys(r).length && keys.every(key => Object.is(l[key], r[key]))
  }
}

export const Value = new ValueFactory()
