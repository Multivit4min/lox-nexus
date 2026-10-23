import { Disposable } from "@lox-nexus/plugin-sdk"
import type { BusMessage } from "./BusMessage.ts"
import type { EventBus } from "./EventBus.ts"
import { Topic } from "./Topic.ts"

/** One message in a trace tree and the messages it caused. */
export interface TraceNode {
  message: BusMessage
  children: TraceNode[]
}

/**
 * Keeps the latest messages (including shadowed ones) for the inspector and rebuilds cause chains.
 * It is a tap on the bus, so it sees force and release messages that subscribers never get.
 * Memory is bounded by `capacity` messages; the oldest are evicted first.
 */
export class Recorder extends Disposable {
  private readonly buffer: BusMessage[] = []
  private readonly byId = new Map<string, BusMessage>()

  /** @param capacity maximum number of recorded messages */
  constructor(bus: Pick<EventBus, "tap">, private readonly capacity = 10_000) {
    super()
    this.own(bus.tap(message => this.record(message)))
  }

  /** number of messages currently held */
  get size() {
    return this.buffer.length
  }

  /** undefined when the message was never recorded or has been evicted */
  get(id: string) {
    return this.byId.get(id)
  }

  /** the last `limit` messages, newest last; optionally filtered by a topic pattern */
  recent(limit = 100, pattern?: string): BusMessage[] {
    const matching = pattern ? this.buffer.filter(message => Topic.matches(pattern, message.topic)) : this.buffer
    return matching.slice(-limit)
  }

  /**
   * the recorded chain the message belongs to. Usually one root; several when ancestors were
   * evicted, so sibling branches whose parent is gone are not lost.
   */
  trace(id: string): TraceNode[] {
    const message = this.byId.get(id)
    if (!message) return []
    const members = this.buffer.filter(candidate => candidate.traceId === message.traceId)
    const nodes = new Map(members.map(member => [member.id, { message: member, children: [] as TraceNode[] }]))
    const roots: TraceNode[] = []
    for (const node of nodes.values()) {
      const parent = node.message.causedBy ? nodes.get(node.message.causedBy) : undefined
      if (parent) parent.children.push(node)
      else roots.push(node)
    }
    return roots
  }

  private record(message: BusMessage) {
    this.buffer.push(message)
    this.byId.set(message.id, message)
    if (this.buffer.length > this.capacity) {
      const evicted = this.buffer.shift()
      if (evicted) this.byId.delete(evicted.id)
    }
  }
}
