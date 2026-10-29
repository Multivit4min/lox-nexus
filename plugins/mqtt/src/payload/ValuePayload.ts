import type { Value } from "@lox-nexus/plugin-sdk/values"

/**
 * Payloads from values. Text: strings as they are, numbers in JavaScript notation ("21.5",
 * "1e+21"), booleans as true and false, null as the empty payload, and structured values (dimmer
 * channels, RGBW, tunable white, T5) as their JSON object, never as display text like "50% 0.2s".
 */
export class ValuePayload {
  static text(value: Value): string {
    switch (value.type) {
      case "null": return ""
      case "string": return value.value
      case "number":
      case "boolean": return String(value.value)
      default: return JSON.stringify(value.value)
    }
  }

  /** the whole value with its type: {"type":"number","value":21.5} */
  static json(value: Value): string {
    return JSON.stringify(value)
  }
}
