import type { ValueOf } from "@lox-nexus/plugin-sdk/values"
import type { EntityState } from "../entities/EntityStore.ts"
import { EntityId } from "../entities/EntityId.ts"
import { EntityActuator } from "./EntityActuator.ts"
import { StateValue } from "../entities/StateValue.ts"

/** CoverEntityFeature.SET_TILT_POSITION */
const SET_TILT_POSITION = 128

/** Tilts a cover's slats, 0 (closed) to 100 (open). */
export class TiltActuator extends EntityActuator<ValueOf<"number">> {
  static readonly id = "tilt"
  static readonly label = "Tilt position"
  static readonly description = "Tilts a cover's slats, 0 (closed) to 100 (open)"
  static readonly accepts = "number"
  static readonly domains = ["cover"]
  static readonly params = EntityId.paramsFor("cover.living_room")
  static readonly concurrency = "latest"

  static supports(entity: EntityState) {
    return EntityActuator.hasFeatures(entity, SET_TILT_POSITION)
  }

  static current(entity: EntityState) {
    return StateValue.current(entity, "current_tilt_position", "%")
  }

  async run({ value }: ValueOf<"number">) {
    await this.call("set_cover_tilt_position", { tilt_position: Math.round(Math.min(100, Math.max(0, value))) })
  }
}
