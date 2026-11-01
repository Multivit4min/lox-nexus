import { createHash } from "node:crypto"

/**
 * The random offset of each occurrence (presence simulation). It is drawn per occurrence but
 * derived from a secret seed and the occurrence's time, so the same occurrence gets the same
 * offset after a restart: a window recomputed at start agrees with the one before, and the panel's
 * next run is the time it really runs. From outside it is as unpredictable as a fresh draw.
 */
export class Jitter {
  static readonly NONE = new Jitter("", 0)

  /** @param seed the instance's secret seed and what tells this schedule (and its start or end) apart */
  constructor(private readonly seed: string, private readonly maxMinutes: number) {}

  /** the largest offset either way, in ms */
  get maxMs() {
    return this.maxMinutes * 60_000
  }

  /** the offset of the occurrence at `raw`, in whole seconds from −max to +max, as ms */
  offset(raw: number) {
    if (this.maxMinutes === 0) return 0
    const seconds = this.maxMinutes * 60
    const hash = createHash("sha256").update(`${this.seed}:${raw}`).digest().readUInt32BE(0)
    return (hash % (2 * seconds + 1) - seconds) * 1000
  }
}
