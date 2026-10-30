import type { BucketPointDto, HistorySeriesDto, RawPointDto, SignalDisplayDto } from "@lox-nexus/api"

/** History values as short text for tooltips and tables; `display` is the signal's unit and decimals. */
export class HistoryText {
  static value(v: number | null | undefined, valueType: string, display: SignalDisplayDto = {}) {
    if (v === null || v === undefined) return "–"
    // an on/off average is the share of time it was on
    if (valueType === "boolean") return v === 1 ? "on" : v === 0 ? "off" : `on ${Math.round(v * 100)} %`
    const digits = display.decimals === undefined ? { maximumFractionDigits: 3 } : { minimumFractionDigits: display.decimals, maximumFractionDigits: display.decimals }
    const text = v.toLocaleString(undefined, digits)
    return display.unit ? `${text} ${display.unit}` : text
  }

  /** a raw point: its text for text values, else the number, with what made it */
  static raw(point: RawPointDto, valueType: string, display: SignalDisplayDto = {}) {
    const value = valueType === "string" ? (point.text ?? "–") : HistoryText.value(point.v, valueType, display)
    return `${value}${point.forced ? " (forced)" : ""}${point.command ? " (command)" : ""}`
  }

  /** a bucket: average, and the range when it moved */
  static bucket(point: BucketPointDto, valueType: string, display: SignalDisplayDto = {}) {
    const avg = HistoryText.value(point.avg, valueType, display)
    if (valueType === "boolean") return point.avg === null || point.avg === 0 || point.avg === 1 ? avg : `${avg} of the time`
    if (point.min === point.max) return avg
    // the unit once, at the end: "412 (380 – 450 W)"
    const plain = display.decimals === undefined ? {} : { decimals: display.decimals }
    return `${HistoryText.value(point.avg, valueType, plain)} (${HistoryText.value(point.min, valueType, plain)} – ${HistoryText.value(point.max, valueType, display)})`
  }

  /** when a point is: the time for raw values and 5-minute buckets, the hour for hourly ones */
  static when(ts: number, resolution: HistorySeriesDto["resolution"]) {
    const date = new Date(ts)
    const day = date.toLocaleDateString([], { day: "numeric", month: "short" })
    const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", ...(resolution === "raw" ? { second: "2-digit" } : {}) })
    return `${day} ${time}`
  }
}
