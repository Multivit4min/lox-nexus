import type { ValueOf } from "@lox-nexus/plugin-sdk/values"
import { VariableActuator } from "./VariableActuator.ts"

/** A string for the script's `nexus.on` and `nexus.get`. */
export class TextActuator extends VariableActuator<ValueOf<"string">> {
  static readonly id = "text"
  static readonly label = "Text"
  static readonly accepts = "string"
}
