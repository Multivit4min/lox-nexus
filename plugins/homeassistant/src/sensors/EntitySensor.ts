import { Sensor } from "@lox-nexus/plugin-sdk"
import type { EntityState } from "../entities/EntityStore.ts"
import type { HomeAssistantPlugin } from "../HomeAssistantPlugin.ts"

/**
 * A sensor that follows one entity: update() runs with its state now and after every change.
 * While disconnected, the last value stays. An entity that doesn't exist (or was deleted) marks
 * the signal as failed; the failure clears when the entity appears again, also as "unavailable".
 */
export abstract class EntitySensor<Params extends { entityId: string }> extends Sensor<HomeAssistantPlugin, Params> {
  override start() {
    const entities = this.plugin.entities
    const id = this.params.entityId
    this.listen(entities, `changed:${id}`, (state: EntityState) => this.changed(state))
    this.listen(entities, `removed:${id}`, () => this.fail(`${id} was removed from Home Assistant`))
    // a full load (also after a reconnect) has already sent each entity's change; only absence is news
    this.listen(entities, "loaded", () => this.failIfMissing())
    const state = entities.get(id)
    if (state) this.changed(state)
    else this.failIfMissing()
  }

  // the entity exists (again): a "removed" failure is over even when its state is no value (unavailable)
  private changed(state: EntityState) {
    this.recover()
    this.update(state)
  }

  /** emits what the state means for this sensor */
  protected abstract update(state: EntityState): void

  private failIfMissing() {
    const entities = this.plugin.entities
    if (entities.loaded && !entities.get(this.params.entityId)) this.fail(`Home Assistant has no entity ${this.params.entityId}`)
  }
}
