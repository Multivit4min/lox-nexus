/** A signal's share of the Miniserver's intercommunication limit, as short text for a table cell. */
export class LoadShare {
  /** "–" without traffic, "<0.1 %" for a trickle, otherwise one decimal */
  static format(percent: number | undefined) {
    if (!percent) return "–"
    if (percent < 0.1) return "<0.1 %"
    return `${percent.toFixed(1)} %`
  }
}
