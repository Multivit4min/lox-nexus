import type { TransformDto } from "@lox-nexus/api"

/** how well a value type fits a target: the same, converted sensibly, or converted to something odd */
export type TypeFit = "same" | "converts" | "unusual"

const SCALAR = ["boolean", "number", "string"]
const LIGHT = ["singleChannel", "rgbw", "tunableWhite"]

/**
 * Value types along a wire, for filtering the signal pickers. Every conversion is possible (the
 * Converter never fails), but some give defaults rather than anything useful, e.g. a colour from a
 * T5 button: those count as "unusual" and are hidden unless asked for.
 */
export class WireTypes {
  static fit(from: string, to: string): TypeFit {
    if (from === to || from === "any" || to === "any") return "same"
    return WireTypes.sensible(from, to) || WireTypes.sensible(to, from) ? "converts" : "unusual"
  }

  /** the type the transforms hand to the target's conversion; "any" when it depends on the value */
  static output(source: string, transforms: readonly TransformDto[]): string {
    return transforms.reduce((type, step) => WireTypes.after(type, step), source)
  }

  private static after(type: string, step: TransformDto): string {
    switch (step.op) {
      case "invert": return "boolean"
      case "scale": return "number"
      case "convert": return step.to
      case "map": {
        // unmatched values pass through unchanged without an `else`
        const results = [...step.cases.map(entry => entry.then.type), step.else?.type ?? type]
        return results.every(result => result === results[0]) ? results[0]! : "any"
      }
      case "unsupported": return "any"
      default: return type
    }
  }

  private static sensible(from: string, to: string) {
    if (SCALAR.includes(from) && SCALAR.includes(to)) return true
    if (LIGHT.includes(from) && LIGHT.includes(to)) return true
    // a dimmer level or an on/off switch drives a light; a T5 press becomes a number, flag or text
    if ((from === "number" || from === "boolean") && LIGHT.includes(to)) return true
    return from === "t5" && SCALAR.includes(to)
  }
}
