import { Value, ValueSchema } from "@lox-nexus/plugin-sdk/values"

/** a value for the bus, or why the script's value can't be one */
export type Converted = { ok: true; value: Value } | { ok: false; problem: string }

/**
 * Converts between script values and bus values. Script objects come from another realm, so
 * types are checked by shape, never with `instanceof`.
 */
export class JsValues {
  /** the longest text a value may carry, as for the webhook's text sensor */
  static readonly MAX_TEXT = 4096

  /**
   * number, string and boolean as they are; null and undefined as null; a Date as its ISO text; a
   * bus value object (`{ type: "rgbw", value: {…} }`, what `nexus.get` returns for those) as
   * itself; other objects and arrays as their JSON text. Text is at most MAX_TEXT characters.
   */
  static toValue(raw: unknown): Converted {
    switch (typeof raw) {
      case "number":
        return Number.isFinite(raw) ? { ok: true, value: Value.number(raw) } : { ok: false, problem: `${raw} is not a finite number` }
      case "string": return JsValues.text(raw)
      case "boolean": return { ok: true, value: Value.boolean(raw) }
      case "undefined": return { ok: true, value: Value.null() }
      case "object": return raw === null ? { ok: true, value: Value.null() } : JsValues.fromObject(raw)
      case "bigint": return { ok: false, problem: "a BigInt can't be sent; convert it with Number()" }
      default: return { ok: false, problem: `a ${typeof raw} can't be sent` }
    }
  }

  /** the value as the script sees it: a primitive, or the bus value object for richer types */
  static toPlain(value: Value): unknown {
    switch (value.type) {
      case "null": return null
      case "boolean":
      case "number":
      case "string": return value.value
      default: return structuredClone(value)
    }
  }

  private static text(text: string): Converted {
    if (text.length > JsValues.MAX_TEXT) return { ok: false, problem: `text longer than ${JsValues.MAX_TEXT} characters` }
    return { ok: true, value: Value.string(text) }
  }

  private static fromObject(raw: object): Converted {
    if (Object.prototype.toString.call(raw) === "[object Date]") {
      const time = (raw as Date).getTime()
      return Number.isFinite(time) ? { ok: true, value: Value.string((raw as Date).toISOString()) } : { ok: false, problem: "the date is invalid" }
    }
    const type = (raw as { type?: unknown }).type
    if (typeof type === "string" && Value.isType(type)) {
      const parsed = ValueSchema.safeParse(raw)
      return parsed.success ? { ok: true, value: parsed.data } : { ok: false, problem: `not a valid ${type} value` }
    }
    try {
      return JsValues.text(JSON.stringify(raw))
    } catch (error) {
      const reason = (error instanceof Error ? error.message : String(error)).split("\n")[0]
      return { ok: false, problem: `the object can't be written as JSON (${reason})` }
    }
  }
}
