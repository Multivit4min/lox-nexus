import { CircleAlert, CircleCheck, OctagonAlert } from "@lucide/vue"

/**
 * How a load percentage reads. Loxone guarantees intercommunication up to 100% (35 messages/s
 * averaged over 2 minutes); from 70% on there is little headroom for bursts. Every level has an
 * icon and a word, so the state never depends on colour alone.
 */
export class LoadLevel {
  static readonly HIGH_FROM = 70
  static readonly OVER_FROM = 100

  static of(percent: number) {
    if (percent >= LoadLevel.OVER_FROM) return { label: "Over the limit", color: "var(--viz-critical)", icon: OctagonAlert }
    if (percent >= LoadLevel.HIGH_FROM) return { label: "High", color: "var(--viz-warning)", icon: CircleAlert }
    return { label: "OK", color: "var(--viz-series)", icon: CircleCheck }
  }

  /** "12%" for whole values, "0.4%" below 1 so light traffic doesn't read as nothing */
  static format(percent: number) {
    return percent > 0 && percent < 1 ? `${percent.toFixed(1)}%` : `${Math.round(percent)}%`
  }
}
