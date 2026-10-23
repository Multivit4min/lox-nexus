import { randomUUID } from "node:crypto"
import type { Cause } from "./BusMessage.ts"

export interface MintedIdentity {
  id: string
  seq: number
  traceId: string
  causedBy?: string
  depth: number
}

/**
 * Mints message ids and remembers recent causes, so a cause known only by id (for example one
 * that came back from a plugin worker) can be resolved to its trace.
 */
export class CausalChain {
  private seq = 0
  private readonly recent = new Map<string, Cause>()

  constructor(
    private readonly bootId = randomUUID().slice(0, 8),
    private readonly capacity = 50_000
  ) {}

  mint(cause?: Cause): MintedIdentity {
    const seq = ++this.seq
    const id = `${this.bootId}-${seq}`
    const identity = cause
      ? { id, seq, traceId: cause.traceId, causedBy: cause.id, depth: cause.depth + 1 }
      : { id, seq, traceId: id, depth: 0 }
    this.remember({ id, traceId: identity.traceId, depth: identity.depth })
    return identity
  }

  resolve(id: string): Cause | undefined {
    return this.recent.get(id)
  }

  private remember(cause: Cause) {
    this.recent.set(cause.id, cause)
    if (this.recent.size > this.capacity) {
      const oldest = this.recent.keys().next()
      if (!oldest.done) this.recent.delete(oldest.value)
    }
  }
}
