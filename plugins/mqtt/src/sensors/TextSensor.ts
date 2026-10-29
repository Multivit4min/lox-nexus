import { Value } from "@lox-nexus/plugin-sdk/values"
import { MessageSensor, type Coerced } from "./MessageSensor.ts"

/**
 * Text. The payload as it is (an empty payload is the empty text); from JSON, strings pass,
 * numbers and booleans are written out, and objects and arrays become their JSON. Null and text
 * over MAX_LENGTH are errors.
 */
export class TextSensor extends MessageSensor {
  static readonly id = "text"
  static readonly label = "Text"
  static readonly description = "The text of each message on a topic, or a part of a JSON message"
  static readonly valueType = "string"
  /** one value travels to the bus, the recorder, every inspector and the Miniserver */
  static readonly MAX_LENGTH = 4096

  protected coerce(raw: unknown): Coerced {
    if (raw === null || raw === undefined) return { ok: false, problem: "expected text, got null" }
    const text = typeof raw === "string" ? raw : typeof raw === "number" || typeof raw === "boolean" ? String(raw) : JSON.stringify(raw)
    if (text.length > TextSensor.MAX_LENGTH) return { ok: false, problem: `text longer than ${TextSensor.MAX_LENGTH} characters` }
    return { ok: true, value: Value.string(text) }
  }
}
