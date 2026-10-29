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
 * Mints message ids and carries trace, depth and wire path from a cause to the messages it causes.
 * It keeps no history: a cause that comes back from a plugin worker by id is looked up by
 * PluginSignals among the commands sent to that plugin, and trace trees come from the Recorder.
 */
export class CausalChain {
  private seq = 0

  /**
   * @param bootId prefix that keeps ids unique across restarts. The server passes a
   *   cryptographically random one; the default (Math.random) is enough for tests and keeps core
   *   free of node:crypto.
   */
  constructor(private readonly bootId = Math.random().toString(36).slice(2, 10).padEnd(8, "0")) {}

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
    return identity
  }
}
