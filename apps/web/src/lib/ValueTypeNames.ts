import type { ValueType } from "@lox-nexus/plugin-sdk/values"

/** Bus value types in words for people, e.g. in the list of what a plugin offers. */
export class ValueTypeNames {
  private static readonly NAMES: Record<ValueType | "any", string> = {
    null: "empty", boolean: "on/off", number: "number", string: "text", t5: "T5 buttons",
    rgbw: "colour (RGBW)", singleChannel: "dimmer", tunableWhite: "tunable white", any: "any value"
  }

  static of(valueType: ValueType | "any") {
    return ValueTypeNames.NAMES[valueType]
  }
}
