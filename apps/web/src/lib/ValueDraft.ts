import { ValueSchema, type Value, type ValueType } from "@lox-nexus/plugin-sdk/values"

/**
 * A value being typed into a form: a type and its text. Structured types are edited as JSON of
 * their payload, e.g. {"red":100,"green":0,"blue":0,"white":0,"fadeTime":1,"flags":0}.
 */
export class ValueDraft {
  static readonly TYPES: ValueType[] = ["number", "boolean", "string", "rgbw", "singleChannel", "tunableWhite", "t5", "null"]

  /** a draft prefilled from an existing value, so forcing a topic starts from what it shows */
  static from(value: Value | undefined): { type: ValueType; text: string } {
    if (!value) return { type: "number", text: "0" }
    if (value.type === "null") return { type: "null", text: "" }
    if (value.type === "string") return { type: "string", text: value.value }
    return { type: value.type, text: typeof value.value === "object" ? JSON.stringify(value.value) : String(value.value) }
  }

  /** @returns the value, or an error message that fits under the input */
  static parse(type: ValueType, text: string): { value: Value } | { error: string } {
    let payload: unknown
    try {
      payload = type === "string" ? text : type === "null" ? null : JSON.parse(text)
    } catch {
      return { error: type === "number" || type === "boolean" ? `not a ${type}` : "not valid JSON" }
    }
    const parsed = ValueSchema.safeParse(type === "null" ? { type } : { type, value: payload })
    return parsed.success ? { value: parsed.data } : { error: parsed.error.issues.map(issue => `${issue.path.join(".")} ${issue.message}`.trim()).join("; ") }
  }
}
