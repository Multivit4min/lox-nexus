/** Remembers the last payload per key and describes which bytes changed. */
export class PayloadDiff {
  private readonly last = new Map<string, Buffer>()

  /** returns e.g. "Δ 6–7: 0000→0040", "new", or "" when nothing changed */
  next(key: string, payload: Buffer): string {
    const previous = this.last.get(key)
    this.last.set(key, payload)
    if (!previous) return "new"
    if (previous.equals(payload)) return ""
    if (previous.length !== payload.length) return `Δ length ${previous.length}→${payload.length}`
    return this.ranges(previous, payload)
      .map(([from, to]) => `Δ ${from === to ? from : `${from}–${to}`}: ${previous.subarray(from, to + 1).toString("hex")}→${payload.subarray(from, to + 1).toString("hex")}`)
      .join(" ")
  }

  private ranges(a: Buffer, b: Buffer): Array<[number, number]> {
    const ranges: Array<[number, number]> = []
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue
      const last = ranges.at(-1)
      if (last && last[1] === i - 1) last[1] = i
      else ranges.push([i, i])
    }
    return ranges
  }
}
