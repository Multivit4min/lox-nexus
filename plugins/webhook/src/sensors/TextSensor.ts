import { Value } from "@lox-nexus/plugin-sdk/values"
import { ValueSensor, type Coerced } from "./ValueSensor.ts"

/**
 * Text from the call. Strings pass through, numbers and booleans are written out, and a JSON
 * object or array becomes its JSON text, so a whole sub-document can be forwarded. Null is
 * refused, as it carries no text, and so is text over MAX_LENGTH.
 */
export class TextSensor extends ValueSensor {
  static readonly id = "text"
  static readonly label = "Text"
  static readonly valueType = "string"
  /** longer text is refused: one value travels to the bus, the recorder, every inspector and the Miniserver */
  static readonly MAX_LENGTH = 4096
  protected readonly kind = "text"

  protected coerce(raw: unknown): Coerced {
    if (raw === null || raw === undefined) return { ok: false, problem: "expected text, got null" }
    const text = typeof raw === "string" ? raw : typeof raw === "number" || typeof raw === "boolean" ? String(raw) : JSON.stringify(raw)
    if (text.length > TextSensor.MAX_LENGTH) return { ok: false, problem: `text longer than ${TextSensor.MAX_LENGTH} characters` }
    return { ok: true, value: Value.string(text) }
  }
}
