import type { ValueOf } from "@lox-nexus/plugin-sdk/values"
import type { EntityState } from "../entities/EntityStore.ts"
import { EntityActuator } from "./EntityActuator.ts"

/** CoverEntityFeature.SET_POSITION and ValveEntityFeature.SET_POSITION share the bit */
const SET_POSITION = 4

/**
 * Moves a cover or valve to a position, 0 (closed) to 100 (open). Valves use
 * valve.set_valve_position; the old integration called it on the water_heater domain.
 */
export class PositionActuator extends EntityActuator<ValueOf<"number">> {
  static readonly id = "position"
  static readonly label = "Position"
  static readonly accepts = "number"
  static readonly domains = ["cover", "valve"]
  static readonly concurrency = "latest"

  static supports(entity: EntityState) {
    return EntityActuator.hasFeatures(entity, SET_POSITION)
  }

  async run({ value }: ValueOf<"number">) {
    const position = Math.round(Math.min(100, Math.max(0, value)))
    if (this.domain === "valve") await this.call("set_valve_position", { position })
    else await this.call("set_cover_position", { position })
  }
}
