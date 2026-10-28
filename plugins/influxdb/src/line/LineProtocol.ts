/** A field value as line protocol knows it: floats, booleans and strings (no integers here). */
export type FieldValue = number | boolean | string

/** One point before it is written as a line. Timestamps are epoch milliseconds. */
export interface Point {
  measurement: string
  tags: Record<string, string>
  fields: Record<string, FieldValue>
  ts: number
}

/**
 * Writes points as InfluxDB line protocol with millisecond precision
 * (`measurement,tag=v field=1.5,text="a" 1730000000000`).
 *
 * Outside string fields a backslash escapes the next character, so backslashes are doubled there
 * (else one before a comma, space or the end of a tag value would swallow the separator). Line
 * protocol can't escape control characters outside string fields (InfluxDB 3 even splits on tabs),
 * so in the measurement, tag keys and tag values they become spaces, then escaped like spaces.
 * Tags are sorted by key, as InfluxDB recommends; tags with an empty value are left out, because
 * line protocol can't carry them. Non-finite numbers (NaN, Infinity) can't be written either: such
 * fields are left out, and a point without fields gives no line.
 *
 * Lines are built with `join`, which gives flat strings: concatenation would leave V8 cons strings
 * (a tree of the parts), which take several times the memory in a buffer of many lines.
 */
export class LineProtocol {
  /** the line for a point, or undefined when none of its fields can be written */
  static line(point: Point): string | undefined {
    const fields = LineProtocol.fields(point.fields)
    if (!fields) return undefined
    const parts = [LineProtocol.measurement(point.measurement)]
    for (const key of Object.keys(point.tags).sort()) {
      const value = point.tags[key] ?? ""
      if (key !== "" && value !== "") parts.push(",", LineProtocol.tagPart(key), "=", LineProtocol.tagPart(value))
    }
    parts.push(" ", fields, " ", String(Math.round(point.ts)))
    return parts.join("")
  }

  /** escapes backslashes, commas and spaces */
  static measurement(name: string) {
    return LineProtocol.printable(name).replace(/[\\, ]/g, "\\$&")
  }

  /** escapes backslashes, commas, equal signs and spaces (tag keys, tag values and field keys) */
  static tagPart(text: string) {
    return LineProtocol.printable(text).replace(/[\\,= ]/g, "\\$&")
  }

  /** a quoted string field value; backslashes and double quotes are escaped, line breaks are kept */
  static string(text: string) {
    return `"${text.replace(/[\\"]/g, "\\$&")}"`
  }

  /** a field value; numbers are floats (no `i` suffix), so all number fields share one type */
  static value(value: FieldValue): string | undefined {
    if (typeof value === "string") return LineProtocol.string(value)
    if (typeof value === "boolean") return value ? "true" : "false"
    return Number.isFinite(value) ? String(value) : undefined
  }

  private static fields(fields: Record<string, FieldValue>) {
    const parts: string[] = []
    for (const [key, value] of Object.entries(fields)) {
      const text = LineProtocol.value(value)
      if (text !== undefined && key !== "") parts.push(`${LineProtocol.tagPart(key)}=${text}`)
    }
    return parts.join(",")
  }

  /** control characters (line breaks, tabs, NUL, DEL) become spaces; CRLF one space */
  private static printable(text: string) {
    // eslint-disable-next-line no-control-regex -- matching control characters is the point
    return text.replace(/\r\n|[\x00-\x1f\x7f]/g, " ")
  }
}
