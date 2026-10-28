import { Value } from "@lox-nexus/plugin-sdk/values"
import { ValueSensor, type Coerced } from "./ValueSensor.ts"

/**
 * A number from the call. JSON numbers pass through; text is parsed strictly ("21.5", "-3",
 * "1e3", and "21,5" with a decimal comma), since query and form values are always text; true and
 * false become 1 and 0. Anything else is refused instead of becoming 0.
 */
export class NumberSensor extends ValueSensor {
  static readonly id = "number"
  static readonly label = "Number"
  static readonly description = "A number from each call to the hook"
  static readonly valueType = "number"
  private static readonly numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
  protected readonly kind = "number"

  protected coerce(raw: unknown): Coerced {
    if (typeof raw === "number") return { ok: true, value: Value.number(raw) }
    if (typeof raw === "boolean") return { ok: true, value: Value.number(raw ? 1 : 0) }
    if (typeof raw === "string") {
      const parsed = NumberSensor.parse(raw)
      if (parsed !== undefined) return { ok: true, value: Value.number(parsed) }
      return { ok: false, problem: `"${raw.slice(0, 40)}" is not a number` }
    }
    return { ok: false, problem: `expected a number, got ${ValueSensor.typeOf(raw)}` }
  }

  static parse(text: string): number | undefined {
    const trimmed = text.trim()
    const normalized = /^[+-]?\d+,\d+$/.test(trimmed) ? trimmed.replace(",", ".") : trimmed
    if (!NumberSensor.numeric.test(normalized)) return undefined
    const number = Number(normalized)
    return Number.isFinite(number) ? number : undefined
  }
}
