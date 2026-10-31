import type { JsonSchemaNode } from "./SchemaField.ts"

/** a duration's unit, as the SDK's duration() stores it */
export type DurationUnit = "ms" | "s" | "min" | "h"

/**
 * A field the form shows with its own input instead of a text box, from the hints the SDK's field
 * kinds write (duration(), timeOfDay(), color(), slider(), file()) and from arrays of an enum.
 */
export type SchemaWidget =
  | { kind: "duration"; unit: DurationUnit }
  | { kind: "time" }
  | { kind: "color" }
  | { kind: "slider"; step: number }
  | { kind: "file"; maxBytes: number; base64: boolean; accept?: string }
  | { kind: "chips" }

/** Reads the widget a schema node asks for; undefined for a plain field. */
export class SchemaWidgets {
  static readonly UNITS: readonly DurationUnit[] = ["ms", "s", "min", "h"]
  /** milliseconds per unit */
  static readonly MS: Readonly<Record<DurationUnit, number>> = { ms: 1, s: 1000, min: 60_000, h: 3_600_000 }

  static detect(node: JsonSchemaNode & Record<string, unknown>, kind: string): SchemaWidget | undefined {
    const number = kind === "number" || kind === "integer"
    if (number && node.format === "duration") {
      const unit = SchemaWidgets.UNITS.find(candidate => candidate === node.unit) ?? "s"
      return { kind: "duration", unit }
    }
    if (number && node.widget === "slider" && node.minimum !== undefined && node.maximum !== undefined) {
      return { kind: "slider", step: typeof node.step === "number" && node.step > 0 ? node.step : 1 }
    }
    if (kind === "string" && node.format === "time") return { kind: "time" }
    if (kind === "string" && node.format === "color") return { kind: "color" }
    if (kind === "string" && node.format === "file") {
      const maxBytes = typeof node.maxBytes === "number" ? node.maxBytes : 256 * 1024
      return { kind: "file", maxBytes, base64: node.contentEncoding === "base64", ...(typeof node.accept === "string" ? { accept: node.accept } : {}) }
    }
    const items = node.items as JsonSchemaNode | undefined
    if (kind === "array" && items && !Array.isArray(items) && Array.isArray(items.enum)) return { kind: "chips" }
    return undefined
  }

  /** the display unit a value reads best in: the largest that divides it evenly, else the field's own */
  static unitFor(value: number, unit: DurationUnit): DurationUnit {
    const ms = value * SchemaWidgets.MS[unit]
    if (!Number.isFinite(ms) || ms === 0) return unit
    return [...SchemaWidgets.UNITS].reverse().find(candidate => SchemaWidgets.MS[candidate] >= SchemaWidgets.MS[unit] && ms % SchemaWidgets.MS[candidate] === 0) ?? unit
  }

  /** a value converted between units, rounded to what the target unit can hold */
  static convert(value: number, from: DurationUnit, to: DurationUnit) {
    return Math.round((value * SchemaWidgets.MS[from]) / SchemaWidgets.MS[to] * 1000) / 1000
  }
}
