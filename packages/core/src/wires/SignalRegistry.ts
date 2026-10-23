import { Topic } from "../bus/Topic.ts"
import type { Signal } from "./Signal.ts"

/** All known signals, unique by id and by (topic, direction). */
export class SignalRegistry {
  private readonly byId = new Map<string, Signal>()

  register(signal: Signal) {
    Topic.assertValid(signal.topic)
    if (this.byId.has(signal.id)) throw new Error(`signal "${signal.id}" is already registered`)
    const clash = [...this.byId.values()].find(s => s.topic === signal.topic && s.direction === signal.direction)
    if (clash) throw new Error(`topic "${signal.topic}" already has a ${signal.direction} signal ("${clash.id}")`)
    this.byId.set(signal.id, { ...signal })
  }

  unregister(id: string) {
    return this.byId.delete(id)
  }

  get(id: string) {
    return this.byId.get(id)
  }

  require(id: string): Signal {
    const signal = this.byId.get(id)
    if (!signal) throw new Error(`unknown signal "${id}"`)
    return signal
  }

  list(): Signal[] {
    return [...this.byId.values()]
  }
}
