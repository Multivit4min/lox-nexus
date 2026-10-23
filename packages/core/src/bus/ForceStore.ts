import type { Value } from "@lox-nexus/plugin-sdk/values"

/** A force as stored. Mirrors ForceInfo plus the value, with `at` and `kind` always filled in. */
export interface ForceRecord {
  topic: string
  value: Value
  by: string
  reason?: string
  /** epoch ms of the automatic release */
  until?: number
  /** epoch ms when the force was set */
  at: number
  /** how the forced value is delivered, persisted so restarts don't have to guess */
  kind: "state" | "command"
}

/** Persistence for forces so they survive restarts. The server provides a database-backed one. */
export interface ForceStore {
  /** all persisted forces, including expired ones; ForceRegistry filters those */
  load(): ForceRecord[]
  /** upserts by topic. A throw aborts the force before it takes effect. */
  save(record: ForceRecord): void
  /** removes the topic's force; must not throw if there is none */
  delete(topic: string): void
}

/** Non-persistent store for tests and for running without a database. */
export class InMemoryForceStore implements ForceStore {
  private readonly records = new Map<string, ForceRecord>()

  load() {
    return [...this.records.values()]
  }

  save(record: ForceRecord) {
    this.records.set(record.topic, { ...record })
  }

  delete(topic: string) {
    this.records.delete(topic)
  }
}
