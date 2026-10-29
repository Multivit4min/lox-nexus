import { TimeAxis } from "../TimeAxis.ts"

export interface MetricPoint {
  ts: number
  v: number
}

/** One line of a chart; its colour comes from its position (categorical slot), so keep the order stable. */
export interface MetricSeries {
  name: string
  points: MetricPoint[]
  /** a figure whose spikes matter (event loop max, p99): drawn from the highest value per two pixels, not the average */
  peak?: true
}

/**
 * Pixel geometry of a small multi-line chart over a time range: one y axis from 0, lines that
 * break where samples are further apart than `gapMs` (Nexus restarted or a sample was missed),
 * and the sample nearest to a pointer. A day of samples is thousands of points, so lines are
 * drawn from their average per two pixels (peak lines from their highest value, so a stall stays
 * visible); the pointer still reads the samples themselves. Pure, so it is tested without a DOM.
 */
export class MetricChartGeometry {
  static readonly MARGIN = { top: 10, right: 12, bottom: 24, left: 60 }
  readonly axis: TimeAxis
  readonly yMax: number

  /** @param scale the unit ticks are round in, e.g. 1 MiB for bytes */
  constructor(readonly series: MetricSeries[], readonly from: number, readonly to: number, readonly width: number, readonly height: number, private readonly gapMs: number, scale = 1) {
    const { left, right } = MetricChartGeometry.MARGIN
    this.axis = new TimeAxis(from, to, left, Math.max(0, width - left - right))
    const peak = Math.max(0, ...series.flatMap(line => this.inRange(line).map(point => point.v)))
    this.yMax = MetricChartGeometry.nice((peak * 1.05) / scale) * scale
  }

  get plotHeight() {
    return Math.max(0, this.height - MetricChartGeometry.MARGIN.top - MetricChartGeometry.MARGIN.bottom)
  }

  y(v: number) {
    return MetricChartGeometry.MARGIN.top + (1 - v / this.yMax) * this.plotHeight
  }

  /** 0 and four steps up to the top */
  yTicks(): number[] {
    return [0, 1, 2, 3, 4].map(i => (this.yMax / 4) * i)
  }

  /** an SVG path through the line's average (or peak) per two pixels; a gap starts a new segment */
  path(line: MetricSeries): string {
    const bucketMs = (this.to - this.from) / Math.max(1, (this.width - MetricChartGeometry.MARGIN.left - MetricChartGeometry.MARGIN.right) / 2)
    const parts: string[] = []
    let group: MetricPoint[] = []
    let move = true
    const flush = () => {
      if (!group.length) return
      const ts = group.reduce((sum, point) => sum + point.ts, 0) / group.length
      const v = line.peak ? Math.max(...group.map(point => point.v)) : group.reduce((sum, point) => sum + point.v, 0) / group.length
      const at = `${this.axis.x(ts).toFixed(1)},${this.y(v).toFixed(1)}`
      // a segment of one point would draw nothing; with round caps a zero-length line is a dot
      parts.push(move ? `M${at}L${at}` : `L${at}`)
      move = false
      group = []
    }
    const bucket = (point: MetricPoint) => Math.floor((point.ts - this.from) / bucketMs)
    let previous: MetricPoint | undefined
    for (const point of this.inRange(line)) {
      const gap = previous !== undefined && point.ts - previous.ts > this.gapMs
      if (previous && (gap || bucket(point) !== bucket(previous))) flush()
      if (gap) move = true
      group.push(point)
      previous = point
    }
    flush()
    return parts.join("")
  }

  /** the time of the sample nearest to a pixel, if any is in range */
  nearest(px: number): number | undefined {
    const at = this.axis.at(px)
    let best: number | undefined
    for (const point of this.series.flatMap(line => this.inRange(line))) {
      if (best === undefined || Math.abs(point.ts - at) < Math.abs(best - at)) best = point.ts
    }
    return best
  }

  private inRange(line: MetricSeries) {
    return line.points.filter(point => point.ts >= this.from && point.ts <= this.to && Number.isFinite(point.v))
  }

  // 1, 2, 2.5 or 5 times a power of ten; 1 for an empty or all-zero chart
  static nice(value: number) {
    if (!(value > 0)) return 1
    const power = 10 ** Math.floor(Math.log10(value))
    return ([1, 2, 2.5, 5, 10].find(step => step * power >= value) ?? 10) * power
  }
}
