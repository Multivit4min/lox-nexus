import type { HistorySeriesDto } from "@lox-nexus/api"
import { TimeAxis } from "./TimeAxis.ts"

/** A stretch of time with one value: what a step line draws. */
export interface Step {
  from: number
  to: number
  v: number
  /** a bucket's own average (clipped at a gap) rather than a value held over from before (cut at a gap) */
  own?: boolean
}

/**
 * Pixel geometry of a signal's history chart. Values hold until they change, so the line is a
 * staircase: every change (raw), or each bucket's time-weighted average with its min/max as a
 * band. Between buckets the value kept the previous bucket's last one. Nothing is drawn in a gap
 * (Nexus wasn't running) nor after one until the next known value, and nothing for "no value".
 */
export class SeriesChartGeometry {
  static readonly MARGIN = { top: 10, right: 12, bottom: 24, left: 48 }
  readonly axis: TimeAxis
  readonly steps: Step[]
  readonly yMin: number
  readonly yMax: number

  /** @param end where the last value stops: the range's end, or now if that is earlier */
  constructor(readonly series: HistorySeriesDto, readonly width: number, readonly height: number, end: number) {
    const { left, right } = SeriesChartGeometry.MARGIN
    this.axis = new TimeAxis(series.from, series.to, left, Math.max(0, width - left - right))
    this.steps = SeriesChartGeometry.cut(SeriesChartGeometry.build(series, Math.min(end, series.to)), series.gaps)
    ;[this.yMin, this.yMax] = SeriesChartGeometry.domain(series, this.steps)
  }

  get plotHeight() {
    return Math.max(0, this.height - SeriesChartGeometry.MARGIN.top - SeriesChartGeometry.MARGIN.bottom)
  }

  y(v: number) {
    return SeriesChartGeometry.MARGIN.top + (1 - (v - this.yMin) / (this.yMax - this.yMin)) * this.plotHeight
  }

  /** 0 and 1 for on/off, else about five round values; just the ends where the numbers are too large to step through */
  yTicks(): number[] {
    if (this.series.valueType === "boolean") return [0, 1]
    const step = SeriesChartGeometry.niceStep((this.yMax - this.yMin) / 4)
    if (!(step > 0) || (this.yMax - this.yMin) / step > 50) return [this.yMin, this.yMax]
    const first = Math.ceil(this.yMin / step)
    const ticks: number[] = []
    for (let i = first; i * step <= this.yMax + step / 1e6; i++) ticks.push(Number((i * step).toPrecision(12)))
    return ticks
  }

  /** the staircase; steps that touch are joined by a vertical line */
  line(): string {
    let path = ""
    let previous: Step | undefined
    for (const step of this.steps) {
      const x1 = this.axis.x(step.from).toFixed(1)
      const x2 = this.axis.x(step.to).toFixed(1)
      const y = this.y(step.v).toFixed(1)
      path += previous && previous.to === step.from ? `L${x1},${y}L${x2},${y}` : `M${x1},${y}L${x2},${y}`
      previous = step
    }
    return path
  }

  /** each bucket's range from min to max, as rectangles */
  band(): string {
    if (this.series.resolution === "raw") return ""
    const { width } = this.series
    return this.series.points.filter(p => p.min !== null && p.max !== null).map(p => {
      const [x1, x2] = [this.axis.x(p.ts), this.axis.x(p.ts + width)]
      const [y1, y2] = [this.y(p.max!), this.y(p.min!)]
      return `M${x1.toFixed(1)},${y1.toFixed(1)}H${x2.toFixed(1)}V${Math.max(y2, y1 + 1).toFixed(1)}H${x1.toFixed(1)}Z`
    }).join("")
  }

  /** index of the point closest to a pixel x, for the crosshair */
  nearest(px: number): number | undefined {
    const points = this.series.points
    if (points.length === 0) return undefined
    const ts = this.axis.at(px)
    let best = 0
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i]!.ts - ts) < Math.abs(points[best]!.ts - ts)) best = i
    return best
  }

  private static build(series: HistorySeriesDto, end: number): Step[] {
    const steps: Step[] = []
    let carry = series.before?.v ?? null
    let at = series.from
    const hold = (until: number) => {
      if (carry !== null && until > at) steps.push({ from: at, to: until, v: carry })
    }
    if (series.resolution === "raw") {
      for (const point of series.points) {
        hold(point.ts)
        ;[carry, at] = [point.v, Math.max(at, point.ts)]
      }
    } else {
      const { width } = series
      for (const point of series.points) {
        hold(point.ts)
        if (point.avg !== null) steps.push({ from: Math.max(point.ts, series.from), to: Math.min(point.ts + width, end), v: point.avg, own: true })
        ;[carry, at] = [point.last, point.ts + width]
      }
    }
    hold(end)
    return steps.filter(step => step.to > step.from)
  }

  // a held value ends where a gap starts and is unknown after it until the next change; a bucket's
  // own average (e.g. the bucket that was open when Nexus came back) is only cut out of the gap
  private static cut(steps: Step[], gaps: HistorySeriesDto["gaps"]): Step[] {
    return steps.flatMap(step => {
      const gap = gaps.find(g => g.to > step.from && g.from < step.to)
      if (!gap) return [step]
      const before = gap.from > step.from ? [{ ...step, to: gap.from }] : []
      const after = step.own && gap.to < step.to ? SeriesChartGeometry.cut([{ ...step, from: gap.to }], gaps) : []
      return [...before, ...after]
    })
  }

  private static domain(series: HistorySeriesDto, steps: Step[]): [number, number] {
    if (series.valueType === "boolean") return [0, 1]
    const values = steps.map(step => step.v)
    if (series.resolution !== "raw") for (const p of series.points) values.push(...[p.min, p.max].filter((v): v is number => v !== null))
    if (values.length === 0) return [0, 1]
    const [low, high] = [Math.min(...values), Math.max(...values)]
    // relative padding: 1e17 ± 1 would still be 1e17
    const pad = Math.max(1, Math.abs(low) * 1e-6)
    if (high - low < pad) return [low - pad, high + pad]
    const step = SeriesChartGeometry.niceStep((high - low) / 4)
    return [Math.floor(low / step) * step, Math.ceil(high / step) * step]
  }

  private static niceStep(rough: number) {
    if (!(rough > 0) || !Number.isFinite(rough)) return 0
    const power = 10 ** Math.floor(Math.log10(rough))
    const fraction = rough / power
    return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power
  }
}
