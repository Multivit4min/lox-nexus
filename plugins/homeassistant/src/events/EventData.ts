type Primitive = string | number | boolean | null

/**
 * a text longer than this is cut: a whole entity state as JSON (state_changed's new_state) can
 * run to many KB, which a Miniserver's text input isn't meant for and the ICI text codec refuses
 */
const MAX_TEXT = 1000

/**
 * Reads an event's `data`: fields by dot path (`args.button`, `params.0`), filters on them, and a
 * field as text. Filters compare numbers and text by their text, so a filter value typed as "1"
 * matches the number 1, as a form or a YAML-minded user would expect.
 */
export class EventData {
  constructor(private readonly data: Record<string, unknown>) {}

  /** the field at a dot path; undefined when any step is missing */
  at(path: string): unknown {
    let current: unknown = this.data
    for (const key of path.split(".")) {
      if (typeof current !== "object" || current === null || !Object.hasOwn(current, key)) return undefined
      current = (current as Record<string, unknown>)[key]
    }
    return current
  }

  /** every filter entry (dot path → expected value) matches; an empty filter matches every event */
  matches(filter: Record<string, unknown>) {
    return Object.entries(filter).every(([path, expected]) => EventData.same(this.at(path), expected))
  }

  /**
   * The field as text: strings as they are, numbers and booleans written out, lists and objects as
   * JSON, cut to MAX_TEXT characters. undefined for a missing field or null.
   */
  text(path: string): string | undefined {
    const value = this.at(path)
    if (value === undefined || value === null) return undefined
    const text = typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : JSON.stringify(value)
    return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text
  }

  private static same(actual: unknown, expected: unknown) {
    if (actual === undefined) return false
    if (EventData.primitive(actual) && EventData.primitive(expected)) return String(actual) === String(expected)
    return JSON.stringify(actual) === JSON.stringify(expected)
  }

  private static primitive(value: unknown): value is Primitive {
    return value === null || ["string", "number", "boolean"].includes(typeof value)
  }
}
