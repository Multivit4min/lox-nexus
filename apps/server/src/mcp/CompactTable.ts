/** a list as columns and rows: far fewer tokens than an array of objects repeating every key */
export interface Table {
  columns: string[]
  rows: unknown[][]
}

/** one page of a long list, and how to get the next */
export interface Page<T> {
  items: T[]
  total: number
  /** pass as `cursor` for the next page; absent on the last */
  next?: string
}

/**
 * The compact shapes every MCP answer uses: tables instead of object arrays, columns no row fills
 * left out, and pages with a cursor (an offset as text) instead of everything at once.
 */
export class CompactTable {
  static of<T>(items: readonly T[], columns: readonly (readonly [string, (item: T) => unknown])[]): Table {
    const used = columns.filter(([, cell]) => items.some(item => CompactTable.filled(cell(item))))
    return { columns: used.map(([name]) => name), rows: items.map(item => used.map(([, cell]) => CompactTable.cell(cell(item)))) }
  }

  /** @param cursor what `next` said last time; an invalid one starts at the beginning */
  static page<T>(items: readonly T[], limit: number, cursor?: string): Page<T> {
    const offset = Math.max(0, Number.parseInt(cursor ?? "0", 10) || 0)
    const end = offset + limit
    return { items: items.slice(offset, end), total: items.length, ...(end < items.length ? { next: String(end) } : {}) }
  }

  private static filled(value: unknown) {
    return value !== undefined && value !== null && value !== "" && value !== false
  }

  private static cell(value: unknown) {
    return value === undefined || value === "" ? null : value
  }
}
