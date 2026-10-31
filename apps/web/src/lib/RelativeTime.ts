/** Durations and times relative to now, as panels show them while the page is open. */
export class RelativeTime {
  /** "in 12:30", "in 1 h 05 min", "in 2 d 3 h"; "now" once it has passed */
  static until(at: number, now: number) {
    const ms = at - now
    return ms <= 0 ? "now" : `in ${RelativeTime.span(ms)}`
  }

  /** "for 45 s", "for 3 min", "for 2 h 10 min" */
  static since(at: number, now: number) {
    return `for ${RelativeTime.coarse(Math.max(0, now - at))}`
  }

  /** a countdown: m:ss below an hour, else hours and minutes, else days and hours */
  static span(ms: number) {
    const seconds = Math.ceil(ms / 1000)
    if (seconds < 3600) return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
    return RelativeTime.coarse(ms)
  }

  private static coarse(ms: number) {
    const minutes = Math.floor(ms / 60_000)
    if (minutes < 1) return `${Math.floor(ms / 1000)} s`
    if (minutes < 60) return `${minutes} min`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} h ${String(minutes % 60).padStart(2, "0")} min`
    return `${Math.floor(hours / 24)} d ${hours % 24} h`
  }
}
