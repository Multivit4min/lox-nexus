/**
 * Suggests ICI packet ids for new Loxone signals. A packet id is at most 8 characters and has to be
 * typed into Loxone Config as well, so suggestions are short and readable: every word of the name
 * gets a share, the last one the rest ("Living Room Temperature" → "lirotemp"), and a taken id
 * gets a number at the end.
 */
export class PacketIds {
  static readonly MAX = 8
  private readonly taken: Set<string>

  /** @param taken ids that exist already; every suggestion is added to them */
  constructor(taken: Iterable<string>) {
    this.taken = new Set(taken)
  }

  suggest(name: string) {
    const base = PacketIds.base(name)
    let id = base
    for (let n = 2; this.taken.has(id); n++) id = base.slice(0, PacketIds.MAX - String(n).length) + n
    this.taken.add(id)
    return id
  }

  private static base(name: string) {
    const words = name.toLowerCase()
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .normalize("NFKD").replace(/\p{M}/gu, "")
      .split(/[^a-z0-9]+/).filter(Boolean).slice(0, PacketIds.MAX)
    // the last word, often what it is ("temperature"), gets what the others leave
    const share = Math.floor(PacketIds.MAX / Math.max(words.length, 1))
    const parts = words.slice(0, -1).map(word => word.slice(0, share))
    parts.push((words.at(-1) ?? "").slice(0, PacketIds.MAX - parts.join("").length))
    return parts.join("") || "signal"
  }
}
