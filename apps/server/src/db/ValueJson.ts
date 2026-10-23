import { ValueSchema, type Value } from "@lox-nexus/plugin-sdk/values"

/** Values as stored in TEXT columns, validated on the way back in. */
export class ValueJson {
  /** the inverse of parse() */
  static stringify(value: Value) {
    return JSON.stringify(value)
  }

  /** undefined for text that is not valid JSON or not a valid Value (e.g. written by a newer version) */
  static parse(text: string): Value | undefined {
    try {
      const parsed = ValueSchema.safeParse(JSON.parse(text))
      return parsed.success ? parsed.data : undefined
    } catch {
      return undefined
    }
  }
}
