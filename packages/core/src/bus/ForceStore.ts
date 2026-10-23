import type { Value } from "@lox-nexus/plugin-sdk/values"

export interface ForceRecord {
  topic: string
  value: Value
  by: string
  reason?: string
  /** epoch ms of the automatic release */
  until?: number
  /** epoch ms when the force was set */
  at: number
}

/** Persistence for forces so they survive restarts. The server provides a database-backed one. */
export interface ForceStore {
  load(): ForceRecord[]
  save(record: ForceRecord): void
  delete(topic: string): void
}

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
