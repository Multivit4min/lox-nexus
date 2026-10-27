import { EventEmitter } from "node:events"
import type { EntitiesEvent } from "../connection/HassMessages.ts"

/** One entity's current state as Home Assistant reports it. */
export interface EntityState {
  /** always a string in Home Assistant, e.g. "on", "21.5", "unavailable" */
  state: string
  attributes: Record<string, unknown>
  /** seconds since the epoch */
  lastChanged: number | undefined
}

/**
 * The current state of every entity, kept up to date from `subscribe_entities`. Emits
 * `changed:<entity id>` with the new EntityState, `removed:<entity id>`, and `loaded` after each
 * full load (the first event of every subscription, so also after a reconnect).
 */
export class EntityStore extends EventEmitter {
  private readonly states = new Map<string, EntityState>()
  /** true once the first full load arrived; entities missing after that don't exist */
  loaded = false

  constructor() {
    super()
    // one listener per sensor; several sensors on one entity are normal
    this.setMaxListeners(0)
  }

  get(entityId: string) {
    return this.states.get(entityId)
  }

  get size() {
    return this.states.size
  }

  entries() {
    return [...this.states.entries()]
  }

  /** `initial`: the subscription's first event, which lists every entity; those it doesn't list were removed meanwhile */
  apply(event: EntitiesEvent, initial: boolean) {
    if (initial && event.a) {
      for (const entityId of [...this.states.keys()]) if (!(entityId in event.a)) this.remove(entityId)
    }
    for (const [entityId, added] of Object.entries(event.a ?? {})) {
      this.set(entityId, { state: added.s, attributes: added.a, lastChanged: added.lc })
    }
    for (const [entityId, diff] of Object.entries(event.c ?? {})) {
      const current = this.states.get(entityId)
      if (!current) continue
      const attributes = { ...current.attributes, ...diff["+"]?.a }
      for (const name of diff["-"]?.a ?? []) delete attributes[name]
      this.set(entityId, { state: diff["+"]?.s ?? current.state, attributes, lastChanged: diff["+"]?.lc ?? current.lastChanged })
    }
    for (const entityId of event.r ?? []) this.remove(entityId)
    if (initial) {
      this.loaded = true
      this.emit("loaded")
    }
  }

  private set(entityId: string, state: EntityState) {
    this.states.set(entityId, state)
    this.emit(`changed:${entityId}`, state)
  }

  private remove(entityId: string) {
    if (this.states.delete(entityId)) this.emit(`removed:${entityId}`)
  }
}
