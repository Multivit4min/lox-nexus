import type { ValueOf } from "@lox-nexus/plugin-sdk/values"
import type { EntityState } from "../entities/EntityStore.ts"
import { EntityId } from "../entities/EntityId.ts"
import { EntityActuator } from "./EntityActuator.ts"
import { StateValue } from "../entities/StateValue.ts"

/** the services for true and false, per domain; the rest use turn_on and turn_off */
const SERVICES: Record<string, [on: string, off: string]> = {
  cover: ["open_cover", "close_cover"],
  valve: ["open_valve", "close_valve"],
  lock: ["lock", "unlock"]
}

/**
 * the supported_features bits both services need, for domains where not every entity has them:
 * TURN_ON | TURN_OFF (climate, media_player, siren), ON_OFF (water_heater), OPEN | CLOSE (cover, valve)
 */
const FEATURES: Record<string, number> = { climate: 128 | 256, media_player: 128 | 256, siren: 1 | 2, water_heater: 8, cover: 1 | 2, valve: 1 | 2 }

/** Switches an entity: on/off, or open/close for covers and valves, lock/unlock for locks. */
export class OnOffActuator extends EntityActuator<ValueOf<"boolean">> {
  static readonly id = "onOff"
  static readonly label = "On/off"
  static readonly description = "Switches an entity on or off (opens or closes a cover or valve, locks or unlocks a lock)"
  static readonly accepts = "boolean"
  static readonly domains = [
    "switch", "light", "input_boolean", "fan", "automation", "siren", "humidifier", "media_player", "remote",
    "climate", "water_heater", "cover", "valve", "lock"
  ] as const
  static readonly params = EntityId.paramsFor("switch.garden_pump or cover.living_room")

  static supports(entity: EntityState, domain: string) {
    const needed = FEATURES[domain]
    return needed === undefined || EntityActuator.hasFeatures(entity, needed)
  }

  static current(entity: EntityState) {
    return StateValue.current(entity)
  }

  /** what true and false do for a domain, for catalog labels */
  static services(domain: string) {
    return SERVICES[domain] ?? ["turn_on", "turn_off"]
  }

  async run(value: ValueOf<"boolean">) {
    const [on, off] = OnOffActuator.services(this.domain)
    await this.call(value.value ? on : off)
  }
}
