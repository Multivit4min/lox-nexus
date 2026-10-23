import type { LoxoneSignalConfig } from "./MiniserverConfig.ts"
import type { SignalLookup } from "./SignalLookup.ts"

/** A configured signal together with the bus topic it currently has. */
export interface LoxoneSignalEntry {
  config: LoxoneSignalConfig
  topic: string
}

/**
 * The signals of one Miniserver, indexed for the routers: inputs by packet id (looked up for
 * every received packet, including the 10 s resends) and outputs by topic. A packet id can have at
 * most one signal per direction, otherwise one of two inputs would never receive data and two
 * outputs would fight over one ICI output.
 */
export class LoxoneSignals implements SignalLookup {
  private readonly byId = new Map<string, LoxoneSignalEntry>()
  private readonly inputs = new Map<string, LoxoneSignalEntry>()
  private readonly outputsByPacket = new Map<string, LoxoneSignalEntry>()
  private readonly outputsByTopic = new Map<string, LoxoneSignalEntry>()

  /**
   * Indexes a signal under the given topic. Does not touch the bus; Miniserver registers the
   * signal there.
   * @throws Error for a duplicate id or a packet id that already has a signal in this direction
   */
  add(config: LoxoneSignalConfig, topic: string): LoxoneSignalEntry {
    if (this.byId.has(config.id)) throw new Error(`signal "${config.id}" already exists`)
    const taken = config.direction === "in" ? this.inputs : this.outputsByPacket
    if (taken.has(config.packetId)) throw new Error(`packet id "${config.packetId}" already has an ${config.direction} signal`)
    const entry = { config, topic }
    this.index(entry)
    return entry
  }

  /** @returns the removed entry, undefined for unknown ids */
  remove(id: string) {
    const entry = this.byId.get(id)
    if (!entry) return undefined
    this.unindex(entry)
    return entry
  }

  /**
   * Recomputes every topic, e.g. after the Miniserver's slug changed; returns the new entries.
   * Only this index changes: the caller must update the bus registry to match.
   */
  retopic(topicOf: (config: LoxoneSignalConfig) => string): LoxoneSignalEntry[] {
    const entries = this.list().map(entry => ({ config: entry.config, topic: topicOf(entry.config) }))
    for (const entry of this.list()) this.unindex(entry)
    for (const entry of entries) this.index(entry)
    return entries
  }

  /** the entry with this signal id */
  get(id: string) {
    return this.byId.get(id)
  }

  /** all entries, in insertion order */
  list(): LoxoneSignalEntry[] {
    return [...this.byId.values()]
  }

  /** the in-signal for a packet id; undefined means the id is only discovered */
  inputFor(packetId: string) {
    return this.inputs.get(packetId)
  }

  /** the out-signal whose topic this is, used to route bus messages to ICI outputs */
  outputFor(topic: string) {
    return this.outputsByTopic.get(topic)
  }

  /** every out-signal */
  outputs(): LoxoneSignalEntry[] {
    return [...this.outputsByTopic.values()]
  }

  // outputs are indexed by topic as well, because bus messages arrive by topic
  private index(entry: LoxoneSignalEntry) {
    this.byId.set(entry.config.id, entry)
    if (entry.config.direction === "in") return void this.inputs.set(entry.config.packetId, entry)
    this.outputsByPacket.set(entry.config.packetId, entry)
    this.outputsByTopic.set(entry.topic, entry)
  }

  private unindex(entry: LoxoneSignalEntry) {
    this.byId.delete(entry.config.id)
    if (entry.config.direction === "in") return void this.inputs.delete(entry.config.packetId)
    this.outputsByPacket.delete(entry.config.packetId)
    this.outputsByTopic.delete(entry.topic)
  }
}
