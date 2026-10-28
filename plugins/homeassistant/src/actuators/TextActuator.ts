import type { ValueOf } from "@lox-nexus/plugin-sdk/values"
import { EntityActuator } from "./EntityActuator.ts"
import type { EntityState } from "../entities/EntityStore.ts"
import { StateValue } from "../entities/StateValue.ts"

/** the service and its field, per domain */
const SERVICES: Record<string, [service: string, field: string]> = {
  text: ["set_value", "value"],
  input_text: ["set_value", "value"],
  select: ["select_option", "option"],
  input_select: ["select_option", "option"],
  climate: ["set_hvac_mode", "hvac_mode"]
}

/** Sets a text, picks an option of a select, or sets a thermostat's HVAC mode (e.g. "heat", "off"). */
export class TextActuator extends EntityActuator<ValueOf<"string">> {
  static readonly id = "text"
  static readonly label = "Text or option"
  static readonly description = "Sets a text, picks an option of a select, or sets a thermostat's mode"
  static readonly accepts = "string"
  static readonly domains = Object.keys(SERVICES)
  static readonly concurrency = "latest"

  static current(entity: EntityState) {
    return StateValue.current(entity)
  }

  async run({ value }: ValueOf<"string">) {
    const [service, field] = SERVICES[this.domain]!
    await this.call(service, { [field]: value })
  }
}
