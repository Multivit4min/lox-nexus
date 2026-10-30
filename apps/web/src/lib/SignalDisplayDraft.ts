import type { SignalDisplayDto } from "@lox-nexus/api"

/** A signal's unit, decimals and stale limit as form fields edit them: text, empty for "not set". */
export class SignalDisplayDraft {
  unit: string
  decimals: string
  staleAfterMin: string

  constructor(display: SignalDisplayDto = {}) {
    this.unit = display.unit ?? ""
    this.decimals = display.decimals === undefined ? "" : String(display.decimals)
    this.staleAfterMin = display.staleAfterMin === undefined ? "" : String(display.staleAfterMin)
  }

  /**
   * For a signal input: both fields always, an empty one as "" or null, which tells the server the
   * form decided (it applies no suggestion of the plugin's). An invalid decimals entry is sent as it
   * is, so the server's check names it.
   */
  input(): { unit: string; decimals: number | null } {
    // a number input may hand over a number instead of its text
    const decimals = String(this.decimals).trim()
    return { unit: String(this.unit).trim(), decimals: decimals === "" ? null : Number(decimals) }
  }

  /** For a source's input: the stale limit, null for never. Invalid text is sent as it is, so the server's check names it. */
  staleInput(): { staleAfterMin: number | null } {
    const minutes = String(this.staleAfterMin).trim()
    return { staleAfterMin: minutes === "" ? null : Number(minutes) }
  }

  /** a catalog entry's unit as a signal's, when it fits (catalogs allow longer ones than signals) */
  static unitOf(entry: { unit?: string | undefined } | undefined) {
    const unit = entry?.unit?.trim()
    return unit && unit.length <= 16 ? unit : undefined
  }

  /** whether these fields mean anything for a value type: only numbers have decimals and units */
  static applies(valueType: string) {
    return valueType === "number" || valueType === "any"
  }
}
