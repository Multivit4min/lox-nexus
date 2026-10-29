import { Value } from "@lox-nexus/plugin-sdk/values"
import { MessageSensor, type Coerced } from "./MessageSensor.ts"

/**
 * On or off. JSON booleans pass, numbers are on when not 0, and text is read as on/off,
 * true/false, yes/no, 1/0, open/closed (any case, spaces around ignored). Other text is an error.
 */
export class SwitchSensor extends MessageSensor {
  static readonly id = "switch"
  static readonly label = "Switch (on/off)"
  static readonly description = "On or off from each message on a topic, e.g. ON/OFF of a plug"
  static readonly valueType = "boolean"
  static readonly words: ReadonlyMap<string, boolean> = new Map([
    ["on", true], ["true", true], ["yes", true], ["1", true], ["open", true],
    ["off", false], ["false", false], ["no", false], ["0", false], ["closed", false]
  ])

  protected coerce(raw: unknown): Coerced {
    if (typeof raw === "boolean") return { ok: true, value: Value.boolean(raw) }
    if (typeof raw === "number") return { ok: true, value: Value.boolean(raw !== 0) }
    if (typeof raw === "string") {
      const state = SwitchSensor.words.get(raw.trim().toLowerCase())
      if (state !== undefined) return { ok: true, value: Value.boolean(state) }
      return { ok: false, problem: raw.trim() === "" ? "the payload is empty" : `${MessageSensor.quote(raw)} is not on or off` }
    }
    return { ok: false, problem: `expected on or off, got ${MessageSensor.typeOf(raw)}` }
  }
}
