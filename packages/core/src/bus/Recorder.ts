import type { DisposableLike } from "@lox-nexus/plugin-sdk"
import type { BusMessage } from "./BusMessage.ts"
import type { EventBus } from "./EventBus.ts"
import { Topic } from "./Topic.ts"

export interface TraceNode {
  message: BusMessage
  children: TraceNode[]
}

/** Keeps the latest messages (including shadowed ones) for the inspector and rebuilds cause chains. */
export class Recorder implements DisposableLike {
  private readonly buffer: BusMessage[] = []
  private readonly byId = new Map<string, BusMessage>()
  private readonly tap: DisposableLike

  constructor(bus: EventBus, private readonly capacity = 10_000) {
    this.tap = bus.tap(message => this.record(message))
  }

  get size() {
    return this.buffer.length
  }

  get(id: string) {
    return this.byId.get(id)
  }

  /** newest last; optionally filtered by a topic pattern */
  recent(limit = 100, pattern?: string): BusMessage[] {
    const matching = pattern ? this.buffer.filter(message => Topic.matches(pattern, message.topic)) : this.buffer
    return matching.slice(-limit)
  }

  /** the whole recorded chain the message belongs to, rooted at the oldest recorded ancestor */
  trace(id: string): TraceNode | undefined {
    const message = this.byId.get(id)
    if (!message) return undefined
    const members = this.buffer.filter(candidate => candidate.traceId === message.traceId)
    const nodes = new Map(members.map(member => [member.id, { message: member, children: [] as TraceNode[] }]))
    let root: TraceNode | undefined
    for (const node of nodes.values()) {
      const parent = node.message.causedBy ? nodes.get(node.message.causedBy) : undefined
      if (parent) parent.children.push(node)
      else root ??= node
    }
    return root
  }

  dispose() {
    this.tap.dispose()
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
