import type { ValueOf } from "@lox-nexus/plugin-sdk/values"
import { EntityActuator } from "./EntityActuator.ts"

const SERVICES: Record<string, string> = {
  scene: "turn_on",
  script: "turn_on",
  button: "press",
  input_button: "press",
  automation: "trigger"
}

/**
 * Activates a scene, runs a script or automation, or presses a button on true. False does
 * nothing, so a Loxone pulse (true, then false) triggers once; the old integration activated
 * scenes on false.
 */
export class TriggerActuator extends EntityActuator<ValueOf<"boolean">> {
  static readonly id = "trigger"
  static readonly label = "Trigger"
  static readonly accepts = "boolean"
  static readonly domains = Object.keys(SERVICES)

  async run(value: ValueOf<"boolean">) {
    if (value.value) await this.call(SERVICES[this.domain]!)
  }
}
