import type { Cell } from "../wire/PanelShapes.ts"

/**
 * A panel cell's text, for assertions on a panel: `cellText(row[1])` instead of narrowing each
 * cell. A cell with only a time gives "".
 */
export function cellText(cell: Cell | undefined): string {
  if (cell === undefined) return ""
  return typeof cell === "string" ? cell : cell.text ?? ""
}
