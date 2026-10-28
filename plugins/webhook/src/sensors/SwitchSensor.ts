import { Value } from "@lox-nexus/plugin-sdk/values"
import { ValueSensor, type Coerced } from "./ValueSensor.ts"

/**
 * An on/off state from the call. JSON booleans pass through, numbers are on when non-zero, and
 * text is read as true/false, on/off, yes/no or 1/0 (any case). Other text is refused.
 */
export class SwitchSensor extends ValueSensor {
  static readonly id = "switch"
  static readonly label = "Switch (on/off)"
  static readonly valueType = "boolean"
  private static readonly words: ReadonlyMap<string, boolean> = new Map([
    ["true", true], ["on", true], ["yes", true], ["1", true],
    ["false", false], ["off", false], ["no", false], ["0", false]
  ])

  protected readonly kind = "switch"

  protected coerce(raw: unknown): Coerced {
    if (typeof raw === "boolean") return { ok: true, value: Value.boolean(raw) }
    if (typeof raw === "number") return { ok: true, value: Value.boolean(raw !== 0) }
    if (typeof raw === "string") {
      const state = SwitchSensor.words.get(raw.trim().toLowerCase())
      if (state !== undefined) return { ok: true, value: Value.boolean(state) }
      return { ok: false, problem: `"${raw.slice(0, 40)}" is not on or off` }
    }
    return { ok: false, problem: `expected on or off, got ${ValueSensor.typeOf(raw)}` }
  }
}
