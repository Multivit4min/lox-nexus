import type { ValueOf } from "@lox-nexus/plugin-sdk/values"
import { EntityActuator } from "./EntityActuator.ts"
import type { EntityState } from "../entities/EntityStore.ts"
import { StateValue } from "../entities/StateValue.ts"

/** Sets a number or input_number entity; Home Assistant refuses values outside its min and max. */
export class NumberActuator extends EntityActuator<ValueOf<"number">> {
  static readonly id = "number"
  static readonly label = "Number"
  static readonly accepts = "number"
  static readonly domains = ["number", "input_number"]
  static readonly concurrency = "latest"

  static current(entity: EntityState) {
    return StateValue.current(entity)
  }

  async run({ value }: ValueOf<"number">) {
    await this.call("set_value", { value })
  }
}
