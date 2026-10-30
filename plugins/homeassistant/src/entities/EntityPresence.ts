import type { Listenable } from "@lox-nexus/plugin-sdk"
import type { EntityStore } from "./EntityStore.ts"

/** What an actuator lends the helper: its fail(), recover() and listen(), which are protected on it. */
export interface PresenceTarget {
  fail(message: string): void
  recover(): void
  listen(emitter: Listenable, event: string, listener: () => void): void
}

/**
 * Whether an actuator's entity exists, like EntitySensor follows it: a deleted or unknown entity
 * marks the signal failed, its return clears that. Home Assistant answers a service call on a
 * missing entity with success and only logs a warning, so without this the command did nothing.
 */
export class EntityPresence {
  static follow(entities: EntityStore, entityId: string, target: PresenceTarget) {
    target.listen(entities, `changed:${entityId}`, () => target.recover())
    target.listen(entities, `removed:${entityId}`, () => target.fail(`${entityId} was removed from Home Assistant`))
    // a full load (also after a reconnect) has already sent each entity's change; only absence is news
    target.listen(entities, "loaded", () => EntityPresence.check(entities, entityId, target))
    EntityPresence.check(entities, entityId, target)
  }

  /**
   * why a command can't reach the entity: undefined while it exists, or before the first load.
   * While disconnected the last known entities count; a reconnect's full load drops what is gone.
   */
  static missing(entities: EntityStore, entityId: string) {
    return entities.loaded && !entities.get(entityId) ? `Home Assistant has no entity ${entityId}` : undefined
  }

  private static check(entities: EntityStore, entityId: string, target: PresenceTarget) {
    const missing = EntityPresence.missing(entities, entityId)
    if (missing) target.fail(missing)
    else if (entities.get(entityId)) target.recover()
  }
}
