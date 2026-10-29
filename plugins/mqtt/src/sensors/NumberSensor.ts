import { Value } from "@lox-nexus/plugin-sdk/values"
import { MessageSensor, type Coerced } from "./MessageSensor.ts"

/**
 * A number. JSON numbers pass; text is parsed strictly ("21.5", "-3", "1e3", and "21,5" with a
 * decimal comma); JSON true and false become 1 and 0. Anything else is an error, not a 0.
 */
export class NumberSensor extends MessageSensor {
  static readonly id = "number"
  static readonly label = "Number"
  static readonly description = "A number from each message on a topic, e.g. a temperature"
  static readonly valueType = "number"
  private static readonly numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i

  protected coerce(raw: unknown): Coerced {
    if (typeof raw === "number") return { ok: true, value: Value.number(raw) }
    if (typeof raw === "boolean") return { ok: true, value: Value.number(raw ? 1 : 0) }
    if (typeof raw === "string") {
      const parsed = NumberSensor.parse(raw)
      if (parsed !== undefined) return { ok: true, value: Value.number(parsed) }
      return { ok: false, problem: raw.trim() === "" ? "the payload is empty" : `${MessageSensor.quote(raw)} is not a number` }
    }
    return { ok: false, problem: `expected a number, got ${MessageSensor.typeOf(raw)}` }
  }

  static parse(text: string): number | undefined {
    const trimmed = text.trim()
    const normalized = /^[+-]?\d+,\d+$/.test(trimmed) ? trimmed.replace(",", ".") : trimmed
    if (!NumberSensor.numeric.test(normalized)) return undefined
    const number = Number(normalized)
    return Number.isFinite(number) ? number : undefined
  }
}
