import type { ValueOf } from "@lox-nexus/plugin-sdk/values"
import { VariableActuator } from "./VariableActuator.ts"

/** A boolean for the script's `nexus.on` and `nexus.get`. */
export class SwitchActuator extends VariableActuator<ValueOf<"boolean">> {
  static readonly id = "switch"
  static readonly label = "Switch"
  static readonly description = "An on/off value the script receives with nexus.on or nexus.get"
  static readonly accepts = "boolean"
}
