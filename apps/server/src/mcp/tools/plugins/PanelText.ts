import type { Cell, Panel, PanelPart, RowAction } from "@lox-nexus/plugin-sdk/wire"

/**
 * A plugin's panel as compact JSON for an agent: cells as text with their tone and times in ISO,
 * buttons as the action and input run_plugin_action takes, and QR codes left out (the web UI
 * shows them; their payload is often a pairing code, which the action's message names anyway).
 */
export class PanelText {
  static of(panel: Panel): unknown {
    if (panel.type !== "sections") return PanelText.part(panel)
    return panel.sections.map(section => ({
      title: section.title,
      ...(section.actions?.length ? { actions: section.actions.map(PanelText.action) } : {}),
      ...PanelText.part(section.panel)
    }))
  }

  /** e.g. "running (ok)", "pairing window (until 2026-10-31T12:00:00.000Z)" */
  static cell(cell: Cell): string {
    if (typeof cell === "string") return cell
    const notes = [
      cell.tone && cell.tone !== "muted" ? cell.tone : undefined,
      cell.until === undefined ? undefined : `until ${PanelText.iso(cell.until)}`,
      cell.since === undefined ? undefined : `since ${PanelText.iso(cell.since)}`,
      cell.at === undefined ? undefined : `at ${PanelText.iso(cell.at)}`
    ].filter(Boolean)
    return [cell.text, notes.length ? `(${notes.join(", ")})` : undefined].filter(Boolean).join(" ")
  }

  private static part(part: PanelPart): Record<string, unknown> {
    switch (part.type) {
      case "keyValue": return {
        items: part.items.map(item => ({ label: item.label, value: PanelText.cell(item.value), ...(item.control ? { action: PanelText.action(item.control) } : {}) }))
      }
      case "table": return {
        columns: part.columns,
        rows: part.rows.map(row => row.map(PanelText.cell)),
        ...(part.rowActions?.some(actions => actions.length) ? { rowActions: part.rowActions.map(actions => actions.map(PanelText.action)) } : {})
      }
      case "tiles": return {
        tiles: part.tiles.map(tile => ({
          label: tile.label,
          value: tile.until === undefined ? `${typeof tile.value === "number" && tile.decimals !== undefined ? tile.value.toFixed(tile.decimals) : tile.value ?? "–"}${tile.unit ? ` ${tile.unit}` : ""}` : `until ${PanelText.iso(tile.until)}`,
          ...(tile.tone && tile.tone !== "muted" ? { tone: tile.tone } : {})
        }))
      }
      case "notice": return { notice: { tone: part.tone, ...(part.title ? { title: part.title } : {}), text: part.text, ...(part.link ? { link: part.link.href } : {}) } }
      case "qr": return { qr: `a QR code${part.caption ? ` (${part.caption})` : ""}, shown on the plugin's page in the web UI` }
      case "json": return { data: part.data }
    }
  }

  private static action(action: RowAction) {
    return { action: action.action, ...(action.label ? { label: action.label } : {}), ...(action.input ? { input: action.input } : {}), ...(action.switch ? { on: action.switch.checked } : {}) }
  }

  private static iso(ms: number) {
    return new Date(ms).toISOString()
  }
}
