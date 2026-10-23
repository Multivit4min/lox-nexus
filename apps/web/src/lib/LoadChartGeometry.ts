import type { LoadSampleDto } from "@lox-nexus/api"

/**
 * Pixel geometry of the load history chart: scales, ticks and paths. Pure, so it can be tested
 * without a DOM. The x axis spans the data there is (10 to 60 minutes), so a fresh history isn't
 * a sliver at the right edge; samples further apart than GAP_MS (the server was down) break the
 * line instead of bridging the gap.
 */
export class LoadChartGeometry {
  static readonly MARGIN = { top: 10, right: 44, bottom: 24, left: 40 }
  static readonly MIN_SPAN_MS = 10 * 60 * 1000
  static readonly MAX_SPAN_MS = 60 * 60 * 1000
  /** three missed 5 s samples */
  static readonly GAP_MS = 15_000
  readonly yMax: number
  readonly xStart: number
  readonly xEnd: number

  constructor(readonly samples: LoadSampleDto[], readonly width: number, readonly height: number, now: number) {
    // the limit (100%) is always in view; above it the axis grows in steps of 50
    const peak = Math.max(100, ...samples.map(s => s.percent))
    this.yMax = peak <= 100 ? 100 : Math.ceil(peak / 50) * 50
    const covered = now - (samples[0]?.ts ?? now)
    this.xEnd = now
    this.xStart = now - Math.min(LoadChartGeometry.MAX_SPAN_MS, Math.max(LoadChartGeometry.MIN_SPAN_MS, covered))
  }

  get plotWidth() {
    return Math.max(0, this.width - LoadChartGeometry.MARGIN.left - LoadChartGeometry.MARGIN.right)
  }

  get plotHeight() {
    return Math.max(0, this.height - LoadChartGeometry.MARGIN.top - LoadChartGeometry.MARGIN.bottom)
  }

  x(ts: number) {
    return LoadChartGeometry.MARGIN.left + ((ts - this.xStart) / (this.xEnd - this.xStart)) * this.plotWidth
  }

  y(percent: number) {
    return LoadChartGeometry.MARGIN.top + (1 - percent / this.yMax) * this.plotHeight
  }

  /** 0, 25, 50, … up to yMax (steps of 50 above 100) */
  yTicks(): number[] {
    const step = this.yMax <= 100 ? 25 : 50
    return Array.from({ length: this.yMax / step + 1 }, (_, i) => i * step)
  }

  /** on the clock: every 5 minutes up to a 15-minute span, 10 up to 30, else 15 */
  xTicks(): number[] {
    const span = this.xEnd - this.xStart
    const step = (span <= 15 * 60_000 ? 5 : span <= 30 * 60_000 ? 10 : 15) * 60_000
    const ticks: number[] = []
    for (let ts = Math.ceil(this.xStart / step) * step; ts <= this.xEnd; ts += step) ticks.push(ts)
    return ticks
  }

  /** runs of samples without a gap */
  segments(): LoadSampleDto[][] {
    const segments: LoadSampleDto[][] = []
    for (const [i, sample] of this.samples.entries()) {
      const previous = this.samples[i - 1]
      if (!previous || sample.ts - previous.ts > LoadChartGeometry.GAP_MS) segments.push([])
      segments.at(-1)!.push(sample)
    }
    return segments
  }

  line(): string {
    return this.segments().map(segment => this.path(segment)).join("")
  }

  /** each segment closed down to the baseline */
  area(): string {
    const base = this.y(0).toFixed(1)
    return this.segments().map(segment => {
      const first = segment[0]!
      const last = segment.at(-1)!
      return `${this.path(segment)}L${this.x(last.ts).toFixed(1)},${base}L${this.x(first.ts).toFixed(1)},${base}Z`
    }).join("")
  }

  private path(segment: LoadSampleDto[]) {
    return segment.map((s, i) => `${i === 0 ? "M" : "L"}${this.x(s.ts).toFixed(1)},${this.y(s.percent).toFixed(1)}`).join("")
  }

  /** index of the sample closest to a pixel x, for the crosshair */
  nearest(px: number): number | undefined {
    if (this.samples.length === 0) return undefined
    let best = 0
    for (let i = 1; i < this.samples.length; i++) {
      if (Math.abs(this.x(this.samples[i]!.ts) - px) < Math.abs(this.x(this.samples[best]!.ts) - px)) best = i
    }
    return best
  }
}
