import type { ValueOf } from "@lox-nexus/plugin-sdk/values"
import { VariableActuator } from "./VariableActuator.ts"

/** A number for the script's `nexus.on` and `nexus.get`. */
export class NumberActuator extends VariableActuator<ValueOf<"number">> {
  static readonly id = "number"
  static readonly label = "Number"
  static readonly description = "A number the script receives with nexus.on or nexus.get"
  static readonly accepts = "number"
}
