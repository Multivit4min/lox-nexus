import { EventEmitter } from "node:events"
import type { TopicKinds } from "../bus/TopicKinds.ts"
import { Topic } from "../bus/Topic.ts"
import type { Signal } from "./Signal.ts"

export interface SignalRegistryEvents {
  unregistered: [signal: Signal]
}

/** All known signals, unique by id and by (topic, direction). Also the bus's source of topic kinds. */
export class SignalRegistry extends EventEmitter<SignalRegistryEvents> implements TopicKinds {
  private readonly byId = new Map<string, Signal>()
  private readonly byTopic = new Map<string, Signal>()

  register(signal: Signal) {
    Topic.assertValid(signal.topic)
    if (this.byId.has(signal.id)) throw new Error(`signal "${signal.id}" is already registered`)
    const clash = this.byTopic.get(SignalRegistry.key(signal.direction, signal.topic))
    if (clash) throw new Error(`topic "${signal.topic}" already has a ${signal.direction} signal ("${clash.id}")`)
    const copy = { ...signal }
    this.byId.set(copy.id, copy)
    this.byTopic.set(SignalRegistry.key(copy.direction, copy.topic), copy)
  }

  unregister(id: string) {
    const signal = this.byId.get(id)
    if (!signal) return false
    this.byId.delete(id)
    this.byTopic.delete(SignalRegistry.key(signal.direction, signal.topic))
    this.emit("unregistered", signal)
    return true
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

  /** targets declare their delivery; a topic with only a source signal carries states */
  kindOf(topic: string): "state" | "command" | undefined {
    const target = this.byTopic.get(SignalRegistry.key("target", topic))
    if (target) return target.delivery
    return this.byTopic.has(SignalRegistry.key("source", topic)) ? "state" : undefined
  }

  private static key(direction: Signal["direction"], topic: string) {
    return `${direction} ${topic}`
  }
}
