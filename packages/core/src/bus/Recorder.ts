import { Disposable } from "@lox-nexus/plugin-sdk"
import type { BusMessage } from "./BusMessage.ts"
import type { EventBus } from "./EventBus.ts"
import { RingBuffer } from "./RingBuffer.ts"
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
  private readonly buffer: RingBuffer<BusMessage>
  private readonly byId = new Map<string, BusMessage>()

  /** @param capacity maximum number of recorded messages */
  constructor(bus: Pick<EventBus, "tap">, capacity = 10_000) {
    super()
    this.buffer = new RingBuffer(capacity)
    this.own(bus.tap(message => this.record(message)))
  }

  /** number of messages currently held */
  get size() {
    return this.buffer.size
  }

  /** undefined when the message was never recorded or has been evicted */
  get(id: string) {
    return this.byId.get(id)
  }

  /** the last `limit` messages, newest last; optionally filtered by a topic pattern. A limit of 0 or less returns nothing. */
  recent(limit = 100, pattern?: string): BusMessage[] {
    if (limit <= 0) return []
    const all = this.buffer.toArray()
    const matching = pattern ? all.filter(message => Topic.matches(pattern, message.topic)) : all
    return matching.slice(-limit)
  }

  /**
   * the recorded chain the message belongs to. Usually one root; several when ancestors were
   * evicted, so sibling branches whose parent is gone are not lost.
   */
  trace(id: string): TraceNode[] {
    const message = this.byId.get(id)
    if (!message) return []
    const members = this.buffer.toArray().filter(candidate => candidate.traceId === message.traceId)
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
    const evicted = this.buffer.push(message)
    if (evicted) this.byId.delete(evicted.id)
    this.byId.set(message.id, message)
  }
}
