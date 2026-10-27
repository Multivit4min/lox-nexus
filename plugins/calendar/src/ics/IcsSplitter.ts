/** A piece of a feed that can be parsed on its own. */
export interface IcsPiece {
  /** a complete calendar: the feed's own lines (time zones, properties) plus the events of one UID */
  text: string
  /** what to call it when it can't be read: its summary, else its UID */
  label: string
}

/**
 * Splits a feed into one small calendar per UID, for when the feed as a whole can't be parsed:
 * one broken event (a malformed RRULE) must not make every other event unreadable. Events of
 * one UID stay together, because a moved occurrence (RECURRENCE-ID) belongs to its series.
 */
export class IcsSplitter {
  static split(text: string): IcsPiece[] {
    const header: string[] = []
    const groups = new Map<string, string[][]>()
    let block: string[] | undefined
    for (const line of text.split(/\r?\n/)) {
      const tag = line.trim().toUpperCase()
      if (tag === "BEGIN:VEVENT") block = []
      if (!block) {
        if (tag !== "BEGIN:VCALENDAR" && tag !== "END:VCALENDAR") header.push(line)
        continue
      }
      block.push(line)
      if (tag !== "END:VEVENT") continue
      const key = IcsSplitter.property(block, "UID") ?? `#${groups.size}`
      groups.set(key, [...groups.get(key) ?? [], block])
      block = undefined
    }
    return [...groups.entries()].map(([key, blocks]) => ({
      text: ["BEGIN:VCALENDAR", ...header, ...blocks.flat(), "END:VCALENDAR"].join("\r\n"),
      label: IcsSplitter.property(blocks[0] ?? [], "SUMMARY") ?? (key.startsWith("#") ? "an event without UID" : key)
    }))
  }

  /** a property's value from a block, with folded lines joined; parameters (SUMMARY;LANGUAGE=de:) are skipped */
  private static property(block: string[], name: string) {
    const unfolded = block.join("\n").replace(/\n[ \t]/g, "").split("\n")
    const line = unfolded.find(candidate => new RegExp(`^${name}[;:]`, "i").test(candidate))
    const value = line?.slice(line.indexOf(":", name.length) + 1).trim()
    return value || undefined
  }
}
