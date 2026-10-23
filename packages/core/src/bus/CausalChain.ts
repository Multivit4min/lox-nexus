import { randomUUID } from "node:crypto"
import { BoundedIndex } from "./BoundedIndex.ts"
import type { Cause } from "./BusMessage.ts"

export interface MintedIdentity {
  id: string
  seq: number
  traceId: string
  causedBy?: string
  depth: number
  via?: string[]
}

/**
 * Mints message ids and remembers recent causes, so a cause known only by id (for example one
 * that came back from a plugin worker) can be resolved to its trace.
 */
export class CausalChain {
  private seq = 0
  private readonly recent: BoundedIndex<Cause>

  constructor(private readonly bootId = randomUUID().slice(0, 8), capacity = 50_000) {
    this.recent = new BoundedIndex(capacity)
  }

  /** viaWire: id of the wire publishing this message, appended to the causal path */
  mint(cause?: Cause, viaWire?: string): MintedIdentity {
    const seq = ++this.seq
    const id = `${this.bootId}-${seq}`
    const via = [...(cause?.via ?? []), ...(viaWire ? [viaWire] : [])]
    const identity: MintedIdentity = cause
      ? { id, seq, traceId: cause.traceId, causedBy: cause.id, depth: cause.depth + 1 }
      : { id, seq, traceId: id, depth: 0 }
    if (via.length > 0) identity.via = via
    this.recent.set(id, { id, traceId: identity.traceId, depth: identity.depth, ...(identity.via ? { via: identity.via } : {}) })
    return identity
  }

  resolve(id: string): Cause | undefined {
    return this.recent.get(id)
  }
}
