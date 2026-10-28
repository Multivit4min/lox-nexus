import type { BucketPointDto, HistorySeriesDto, RawPointDto } from "@lox-nexus/api"

/** History values as short text for tooltips and tables. */
export class HistoryText {
  static value(v: number | null | undefined, valueType: string) {
    if (v === null || v === undefined) return "–"
    // an on/off average is the share of time it was on
    if (valueType === "boolean") return v === 1 ? "on" : v === 0 ? "off" : `on ${Math.round(v * 100)} %`
    return v.toLocaleString(undefined, { maximumFractionDigits: 3 })
  }

  /** a raw point: its text for text values, else the number, with what made it */
  static raw(point: RawPointDto, valueType: string) {
    const value = valueType === "string" ? (point.text ?? "–") : HistoryText.value(point.v, valueType)
    return `${value}${point.forced ? " (forced)" : ""}${point.command ? " (command)" : ""}`
  }

  /** a bucket: average, and the range when it moved */
  static bucket(point: BucketPointDto, valueType: string) {
    const avg = HistoryText.value(point.avg, valueType)
    if (valueType === "boolean") return point.avg === null || point.avg === 0 || point.avg === 1 ? avg : `${avg} of the time`
    return point.min === point.max ? avg : `${avg} (${HistoryText.value(point.min, valueType)} – ${HistoryText.value(point.max, valueType)})`
  }

  /** when a point is: the time for raw values and 5-minute buckets, the hour for hourly ones */
  static when(ts: number, resolution: HistorySeriesDto["resolution"]) {
    const date = new Date(ts)
    const day = date.toLocaleDateString([], { day: "numeric", month: "short" })
    const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", ...(resolution === "raw" ? { second: "2-digit" } : {}) })
    return `${day} ${time}`
  }
}
