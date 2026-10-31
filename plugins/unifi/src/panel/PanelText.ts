/**
 * Text from the console or a failed read, fit for the panel: the host refuses a cell over 1000
 * characters and a time that isn't a number, and one refused cell fails the whole panel.
 */
export class PanelText {
  static clip(text: string, max = 300) {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text
  }

  /** an API timestamp as epoch ms for a countdown, or nothing when it doesn't parse */
  static time(iso: string | undefined) {
    const ms = iso === undefined ? Number.NaN : Date.parse(iso)
    return Number.isFinite(ms) ? ms : undefined
  }
}
