import type { SignalDisplayDto } from "@lox-nexus/api"

/** A signal's unit and decimals as form fields edit them: text, empty for "not set". */
export class SignalDisplayDraft {
  unit: string
  decimals: string

  constructor(display: SignalDisplayDto = {}) {
    this.unit = display.unit ?? ""
    this.decimals = display.decimals === undefined ? "" : String(display.decimals)
  }

  /**
   * For a signal input: the unit always (empty clears it), decimals only when given. An invalid
   * decimals entry is sent as it is, so the server's check names it.
   */
  input(): { unit: string; decimals?: number } {
    // a number input may hand over a number instead of its text
    const decimals = String(this.decimals).trim()
    return { unit: String(this.unit).trim(), ...(decimals === "" ? {} : { decimals: Number(decimals) }) }
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
