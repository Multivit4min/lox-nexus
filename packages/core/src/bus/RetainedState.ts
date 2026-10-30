import { Value } from "@lox-nexus/plugin-sdk/values"
import type { BusMessage } from "./BusMessage.ts"

/** The last real (unforced) value of a topic, as persisted between restarts. `ts` is epoch ms of that value. */
export interface SnapshotEntry {
  topic: string
  value: Value
  ts: number
}

/** Retained data of one topic. */
interface TopicState {
  /** what subscribers currently see (may come from a force) */
  effective?: BusMessage
  /** the last real value, kept while forced so a release can restore it */
  real?: BusMessage
  kind: "state" | "command"
  /** epoch ms of the last state published, also one dropped as a repeat; not from restored values */
  seen?: number
}

/** Last value per topic. Persisted as periodic snapshots of real values, never per change. */
export class RetainedState {
  private readonly topics = new Map<string, TopicState>()
  private readonly dirty = new Set<string>()

  /** the message subscribers currently see, if any */
  effective(topic: string) {
    return this.topics.get(topic)?.effective
  }

  /** drops everything retained for the topic, as if it had never been published */
  forget(topic: string) {
    this.topics.delete(topic)
    this.dirty.delete(topic)
  }

  /** every retained topic */
  topicNames(): string[] {
    return [...this.topics.keys()]
  }

  /** every topic's current message, in first-seen order */
  *effectiveAll(): Generator<BusMessage> {
    for (const state of this.topics.values()) if (state.effective) yield state.effective
  }

  /** the last non-forced message; while forced, this is what a release restores */
  real(topic: string) {
    return this.topics.get(topic)?.real
  }

  /** whether the topic carries states or commands: "command" once a command was seen on it, else "state" */
  kindOf(topic: string): "state" | "command" {
    return this.topics.get(topic)?.kind ?? "state"
  }

  /** when a state last arrived on the topic, also an equal one the bus dropped; undefined since the start */
  lastSeen(topic: string) {
    return this.topics.get(topic)?.seen
  }

  noteSeen(topic: string, ts: number) {
    this.entry(topic).seen = ts
  }

  /** remembers that the topic carries commands, so a force on it is delivered as a command */
  noteCommand(topic: string) {
    this.entry(topic).kind = "command"
  }

  /** restored values are already persisted, so they don't mark the topic dirty */
  setReal(message: BusMessage) {
    this.entry(message.topic).real = message
    if (!message.flags?.restored) this.dirty.add(message.topic)
  }

  /** does not mark the topic dirty: forced values are persisted by the ForceStore, not the snapshot */
  setEffective(message: BusMessage) {
    this.entry(message.topic).effective = message
  }

  /** the topic then has no current value for subscribers until the next real publish */
  clearEffective(topic: string) {
    const state = this.topics.get(topic)
    if (state) state.effective = undefined
  }

  /**
   * real state values changed since they were last confirmed. Nothing is cleared here: the
   * caller confirms after its write succeeded, so a failed write is retried next time.
   */
  pending(): SnapshotEntry[] {
    const entries: SnapshotEntry[] = []
    for (const topic of this.dirty) {
      const real = this.topics.get(topic)?.real
      if (real?.value) entries.push({ topic, value: real.value, ts: real.ts })
      else this.dirty.delete(topic)
    }
    return entries
  }

  /** marks entries as persisted; a topic that changed again since pending() stays dirty */
  confirm(entries: readonly SnapshotEntry[]) {
    for (const entry of entries) {
      const real = this.topics.get(entry.topic)?.real
      if (!real?.value || (real.ts === entry.ts && Value.equals(real.value, entry.value))) this.dirty.delete(entry.topic)
    }
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
