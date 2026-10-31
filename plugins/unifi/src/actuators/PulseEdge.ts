/**
 * Tells a new pulse from a repeat: true counts only after false (the start counts as false), so a
 * Loxone pulse (true, then false) acts once and a value sent again does nothing. A replayed value
 * (a force the host delivers again after a start) is ignored altogether: it never counts, and it
 * doesn't make the next live true a repeat. That a restart of Nexus repeats nothing rests on the
 * host flagging what it delivers again; a true still held by the Miniserver when Nexus starts,
 * and not kept by Nexus before, arrives as new.
 */
export class PulseEdge {
  private last = false

  rises(value: boolean, replayed = false) {
    if (replayed) return false
    const rise = value && !this.last
    this.last = value
    return rise
  }
}
