import type { Cell, Panel, PanelPart } from "../wire/PanelShapes.ts"

type Part = PanelPart
type Tile = Extract<Part, { type: "tiles" }>["tiles"][number]

/**
 * Turns a panel into what hosts without the "panel.v2" feature accept: cells into text (a
 * countdown into the time it ends), tiles and notices into key-value lists, and no controls on
 * key-value items. Buttons on rows and section headings stay; those hosts ignore `instant` and
 * `switch` and open the dialog.
 */
export class PanelCompat {
  constructor(private readonly timeZone?: string) {}

  panel(panel: Panel): Panel {
    if (panel.type !== "sections") return this.part(panel)
    return { ...panel, sections: panel.sections.map(section => ({ ...section, panel: this.part(section.panel) })) }
  }

  part(part: Part): Part {
    switch (part.type) {
      case "keyValue": return { type: "keyValue", items: part.items.map(item => ({ label: item.label, value: this.text(item.value) })) }
      case "table": return { ...part, rows: part.rows.map(row => row.map(cell => this.text(cell))) }
      case "tiles": return { type: "keyValue", items: part.tiles.map(tile => ({ label: tile.label, value: this.tile(tile) })) }
      case "notice": return { type: "keyValue", items: [{ label: part.title ?? part.tone, value: part.link ? `${part.text} (${part.link.label}: ${part.link.href})` : part.text }] }
      default: return part
    }
  }

  /** a cell as plain text; a time it counts to or from as the time itself */
  text(cell: Cell): string {
    if (typeof cell === "string") return cell
    const time = cell.until !== undefined ? `until ${this.time(cell.until)}` : cell.since !== undefined ? `since ${this.time(cell.since)}` : ""
    return [cell.text, time].filter(Boolean).join(" ")
  }

  private tile(tile: Tile) {
    if (tile.until !== undefined) return this.text({ until: tile.until })
    if (tile.value === null) return "–"
    const value = typeof tile.value === "number" && tile.decimals !== undefined ? tile.value.toFixed(tile.decimals) : String(tile.value)
    return tile.unit ? `${value} ${tile.unit}` : value
  }

  private time(ms: number) {
    try {
      return new Date(ms).toLocaleString("en-GB", { ...(this.timeZone ? { timeZone: this.timeZone } : {}), dateStyle: "short", timeStyle: "short" })
    } catch {
      return new Date(ms).toISOString()
    }
  }
}
