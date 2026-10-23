import type { Value } from "@lox-nexus/plugin-sdk/values"
import type { BusMessage } from "./BusMessage.ts"

export interface SnapshotEntry {
  topic: string
  value: Value
  ts: number
}

interface TopicState {
  /** what subscribers currently see (may come from a force) */
  effective?: BusMessage
  /** the last real value, kept while forced so a release can restore it */
  real?: BusMessage
  kind: "state" | "command"
}

/** Last value per topic. Persisted as periodic snapshots of real values, never per change. */
export class RetainedState {
  private readonly topics = new Map<string, TopicState>()
  private readonly dirty = new Set<string>()

  effective(topic: string) {
    return this.topics.get(topic)?.effective
  }

  real(topic: string) {
    return this.topics.get(topic)?.real
  }

  /** whether the topic carries states or commands, as seen from its real publishes */
  kindOf(topic: string): "state" | "command" {
    return this.topics.get(topic)?.kind ?? "state"
  }

  noteCommand(topic: string) {
    this.entry(topic).kind = "command"
  }

  setReal(message: BusMessage) {
    this.entry(message.topic).real = message
    this.dirty.add(message.topic)
  }

  setEffective(message: BusMessage) {
    this.entry(message.topic).effective = message
  }

  /** real state values changed since the last call */
  takeDirty(): SnapshotEntry[] {
    const entries: SnapshotEntry[] = []
    for (const topic of this.dirty) {
      const real = this.topics.get(topic)?.real
      if (real?.value) entries.push({ topic, value: real.value, ts: real.ts })
    }
    this.dirty.clear()
    return entries
  }

  private entry(topic: string): TopicState {
    let state = this.topics.get(topic)
    if (!state) {
      state = { kind: "state" }
      this.topics.set(topic, state)
    }
    return state
  }
}
