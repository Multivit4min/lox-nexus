import { SignalDisplays, type SignalDisplay } from "@lox-nexus/core"

/** The display columns both signal tables have (migration 8). */
export interface SignalDisplayRow {
  unit: string | null
  decimals: number | null
  stale_after_min: number | null
}

/** Maps a signal's unit and decimals to its table's columns and back; NULL is "not set". */
export class SignalDisplayColumns {
  static readonly ASSIGN = "unit = :unit, decimals = :decimals, stale_after_min = :staleAfterMin"
  static readonly COLUMNS = "unit, decimals, stale_after_min"
  static readonly VALUES = ":unit, :decimals, :staleAfterMin"

  static params(display: SignalDisplay) {
    return { unit: display.unit || null, decimals: display.decimals ?? null, staleAfterMin: display.staleAfterMin ?? null }
  }

  static read(row: SignalDisplayRow): SignalDisplay {
    return SignalDisplays.of({
      ...(row.unit === null ? {} : { unit: row.unit }), ...(row.decimals === null ? {} : { decimals: row.decimals }),
      ...(row.stale_after_min === null ? {} : { staleAfterMin: row.stale_after_min })
    })
  }
}
