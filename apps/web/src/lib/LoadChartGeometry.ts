import type { LoadSampleDto } from "@lox-nexus/api"

/** Pixel geometry of the load history chart: scales, ticks and paths. Pure, so it can be tested without a DOM. */
export class LoadChartGeometry {
  static readonly MARGIN = { top: 10, right: 44, bottom: 24, left: 40 }
  readonly yMax: number
  readonly xStart: number
  readonly xEnd: number

  /** @param spanMs how much time the x axis shows, ending at `now` */
  constructor(
    readonly samples: LoadSampleDto[],
    readonly width: number,
    readonly height: number,
    now: number,
    spanMs = 60 * 60 * 1000
  ) {
    // the limit (100%) is always in view; above it the axis grows in steps of 50
    const peak = Math.max(100, ...samples.map(s => s.percent))
    this.yMax = peak <= 100 ? 100 : Math.ceil(peak / 50) * 50
    this.xEnd = now
    this.xStart = now - spanMs
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

  /** every 15 minutes on the clock */
  xTicks(): number[] {
    const step = 15 * 60 * 1000
    const ticks: number[] = []
    for (let ts = Math.ceil(this.xStart / step) * step; ts <= this.xEnd; ts += step) ticks.push(ts)
    return ticks
  }

  line(): string {
    return this.samples.map((s, i) => `${i === 0 ? "M" : "L"}${this.x(s.ts).toFixed(1)},${this.y(s.percent).toFixed(1)}`).join("")
  }

  /** the line closed down to the baseline */
  area(): string {
    const first = this.samples[0]
    const last = this.samples.at(-1)
    if (!first || !last) return ""
    const base = this.y(0).toFixed(1)
    return `${this.line()}L${this.x(last.ts).toFixed(1)},${base}L${this.x(first.ts).toFixed(1)},${base}Z`
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
