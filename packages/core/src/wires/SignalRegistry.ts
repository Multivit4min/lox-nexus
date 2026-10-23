import { EventEmitter } from "node:events"
import type { TopicKinds } from "../bus/TopicKinds.ts"
import { Topic } from "../bus/Topic.ts"
import type { Signal } from "./Signal.ts"

/** Events of SignalRegistry. */
export interface SignalRegistryEvents {
  /** emitted after removal; WireEngine reacts by dropping the wires that used the signal */
  unregistered: [signal: Signal]
  /** emitted after update(); WireEngine rebuilds the wires that use the signal */
  updated: [signal: Signal, previous: Signal]
}

/** All known signals, unique by id and by (topic, direction). Also the bus's source of topic kinds. */
export class SignalRegistry extends EventEmitter<SignalRegistryEvents> implements TopicKinds {
  private readonly byId = new Map<string, Signal>()
  private readonly byTopic = new Map<string, Signal>()

  /**
   * Stores a copy of the signal.
   * @throws RangeError for an invalid topic; Error for a duplicate id or a second signal with the same topic and direction
   */
  register(signal: Signal) {
    Topic.assertValid(signal.topic)
    if (this.byId.has(signal.id)) throw new Error(`signal "${signal.id}" is already registered`)
    const clash = this.byTopic.get(SignalRegistry.key(signal.direction, signal.topic))
    if (clash) throw new Error(`topic "${signal.topic}" already has a ${signal.direction} signal ("${clash.id}")`)
    const copy = { ...signal }
    this.byId.set(copy.id, copy)
    this.byTopic.set(SignalRegistry.key(copy.direction, copy.topic), copy)
  }

  /** @returns false if the id is unknown */
  unregister(id: string) {
    const signal = this.byId.get(id)
    if (!signal) return false
    this.byId.delete(id)
    this.byTopic.delete(SignalRegistry.key(signal.direction, signal.topic))
    this.emit("unregistered", signal)
    return true
  }

  /**
   * Replaces a registered signal, e.g. when its topic changes because its owner was renamed.
   * Wires refer to signals by id, so they survive this.
   * @throws RangeError for an invalid topic; Error for an unknown id or a topic another signal has
   */
  update(signal: Signal) {
    Topic.assertValid(signal.topic)
    const previous = this.require(signal.id)
    const key = SignalRegistry.key(signal.direction, signal.topic)
    const clash = this.byTopic.get(key)
    if (clash && clash.id !== signal.id) throw new Error(`topic "${signal.topic}" already has a ${signal.direction} signal ("${clash.id}")`)
    const copy = { ...signal }
    this.byTopic.delete(SignalRegistry.key(previous.direction, previous.topic))
    this.byId.set(copy.id, copy)
    this.byTopic.set(key, copy)
    this.emit("updated", copy, previous)
  }

  /** undefined for unknown ids; use require() when the signal must exist */
  get(id: string) {
    return this.byId.get(id)
  }

  /** @throws Error for an unknown id */
  require(id: string): Signal {
    const signal = this.byId.get(id)
    if (!signal) throw new Error(`unknown signal "${id}"`)
    return signal
  }

  /** snapshot of all signals in registration order */
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
