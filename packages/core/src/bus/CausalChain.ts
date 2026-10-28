import { BoundedIndex } from "./BoundedIndex.ts"
import type { Cause } from "./BusMessage.ts"

/** The fields of a BusMessage that the causal chain decides. */
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

  /**
   * @param bootId prefix that keeps ids unique across restarts. The server passes a
   *   cryptographically random one; the default (Math.random) is enough for tests and keeps core
   *   free of node:crypto.
   * @param capacity how many recent causes stay resolvable (see resolve())
   */
  constructor(private readonly bootId = Math.random().toString(36).slice(2, 10).padEnd(8, "0"), capacity = 50_000) {
    this.recent = new BoundedIndex(capacity)
  }

  /**
   * Creates the identity of the next message. Without a cause it starts a new trace at depth 0.
   * @param viaWire id of the wire publishing this message, appended to the causal path
   */
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

  /** undefined once the cause fell out of the ring of recent messages; callers then start a new trace */
  resolve(id: string): Cause | undefined {
    return this.recent.get(id)
  }
}
