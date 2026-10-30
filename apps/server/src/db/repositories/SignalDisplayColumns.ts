import { SignalDisplays, type SignalDisplay } from "@lox-nexus/core"

/** The display columns both signal tables have (migration 8). */
export interface SignalDisplayRow {
  unit: string | null
  decimals: number | null
}

/** Maps a signal's unit and decimals to its table's columns and back; NULL is "not set". */
export class SignalDisplayColumns {
  static readonly ASSIGN = "unit = :unit, decimals = :decimals"

  static params(display: SignalDisplay) {
    return { unit: display.unit || null, decimals: display.decimals ?? null }
  }

  static read(row: SignalDisplayRow): SignalDisplay {
    return SignalDisplays.of({ ...(row.unit === null ? {} : { unit: row.unit }), ...(row.decimals === null ? {} : { decimals: row.decimals }) })
  }
}
