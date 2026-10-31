import type { Cell, Tone } from "@lox-nexus/plugin-sdk/wire"
import { RelativeTime } from "./RelativeTime.ts"

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" })

/** Reading panel cells: their text (with a live time), tone, order and search. */
export class PanelCells {
  static text(cell: Cell | undefined, now: number) {
    if (cell === undefined) return ""
    if (typeof cell === "string") return cell
    const time = cell.until !== undefined ? RelativeTime.until(cell.until, now) : cell.since !== undefined ? RelativeTime.since(cell.since, now) : ""
    return [cell.text, time].filter(Boolean).join(" · ")
  }

  static tone(cell: Cell | undefined): Tone | undefined {
    return typeof cell === "object" ? cell.tone : undefined
  }

  /** natural order ("Port 2" before "Port 10", "-5 W" before "12 W"); a time counts as its moment */
  static compare(a: Cell | undefined, b: Cell | undefined) {
    const time = (cell: Cell | undefined) => (typeof cell === "object" ? cell.until ?? cell.since : undefined)
    const [ta, tb] = [time(a), time(b)]
    if (ta !== undefined && tb !== undefined) return ta - tb
    const [na, nb] = [PanelCells.number(a), PanelCells.number(b)]
    if (na !== undefined && nb !== undefined && na !== nb) return na - nb
    return collator.compare(PanelCells.text(a, 0), PanelCells.text(b, 0))
  }

  /** whether a row has every word of the query in one of its cells, ignoring case */
  static matches(row: readonly Cell[], query: string) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const text = row.map(cell => PanelCells.text(cell, 0).toLowerCase()).join(" ")
    return words.every(word => text.includes(word))
  }

  // a cell that starts with a number ("412 W", "-3.5 %") sorts by it
  private static number(cell: Cell | undefined) {
    const match = /^\s*(-?\d+(?:[.,]\d+)?)/.exec(PanelCells.text(cell, 0))
    return match ? Number(match[1]!.replace(",", ".")) : undefined
  }
}
