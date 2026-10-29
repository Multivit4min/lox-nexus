import type { MetricPoint } from "./MetricChartGeometry.ts"

/** How a heap moved over a long run. */
export interface Trend {
  /** MiB per hour, from the lowest value of each window (what is left after garbage collection) */
  mibPerHour: number
  /** hours the trend covers */
  hours: number
  /** mean of the windows' lowest values, MiB */
  floorMib: number
  verdict: "flat" | "growing" | "shrinking"
}

const MIB = 1024 * 1024
const HOUR = 3_600_000

/**
 * The soak-run question, "does the heap stay flat?", answered from samples. The first WARMUP_MS
 * after a start, and after any gap (a plugin worker that restarted begins with an empty heap), are
 * left out while caches fill. Then each complete WINDOW_MS window contributes its lowest value,
 * because a heap saws up and down with garbage collection and only its floor tells a leak; a
 * window with too few samples (the one still running, one with a gap) may have missed the low
 * point and is left out. A least-squares line through those floors gives the growth. It counts as
 * flat while a day at that rate would add less than 5% of the floor (at least 2 MiB).
 */
export class HeapTrend {
  static readonly WARMUP_MS = 10 * 60_000
  static readonly WINDOW_MS = 10 * 60_000
  /** an hour of windows before there is a verdict */
  static readonly MIN_WINDOWS = 6
  /** a window counts with this share of the samples it should have */
  static readonly COMPLETE = 0.8

  /** @param intervalMs between two samples; points further apart than 2.5 intervals are a gap */
  static of(points: MetricPoint[], intervalMs: number): Trend | undefined {
    const floors = HeapTrend.floors(HeapTrend.warm(points, intervalMs), intervalMs)
    if (floors.length < HeapTrend.MIN_WINDOWS) return undefined
    const slope = HeapTrend.slope(floors)
    const mibPerHour = (slope * HOUR) / MIB
    const floorMib = floors.reduce((sum, point) => sum + point.v, 0) / floors.length / MIB
    const day = mibPerHour * 24
    const verdict = Math.abs(day) < Math.max(2, floorMib * 0.05) ? "flat" : day > 0 ? "growing" : "shrinking"
    return { mibPerHour, hours: (floors.at(-1)!.ts - floors[0]!.ts) / HOUR, floorMib, verdict }
  }

  // without the first WARMUP_MS of every stretch between gaps
  private static warm(points: MetricPoint[], intervalMs: number): MetricPoint[] {
    let start = points[0]?.ts ?? 0
    return points.filter((point, i) => {
      const previous = points[i - 1]
      if (previous && point.ts - previous.ts > intervalMs * 2.5) start = point.ts
      return point.ts >= start + HeapTrend.WARMUP_MS
    })
  }

  // the lowest point of each complete window, at its own time
  private static floors(points: MetricPoint[], intervalMs: number): MetricPoint[] {
    const first = points[0]?.ts ?? 0
    const windows = new Map<number, { low: MetricPoint; count: number }>()
    for (const point of points) {
      const key = Math.floor((point.ts - first) / HeapTrend.WINDOW_MS)
      const window = windows.get(key)
      if (!window) windows.set(key, { low: point, count: 1 })
      else windows.set(key, { low: point.v < window.low.v ? point : window.low, count: window.count + 1 })
    }
    const needed = (HeapTrend.WINDOW_MS / intervalMs) * HeapTrend.COMPLETE
    return [...windows.values()].filter(window => window.count >= needed).map(window => window.low).sort((a, b) => a.ts - b.ts)
  }

  // least squares, value per millisecond
  private static slope(points: MetricPoint[]) {
    const n = points.length
    const meanT = points.reduce((sum, point) => sum + point.ts, 0) / n
    const meanV = points.reduce((sum, point) => sum + point.v, 0) / n
    const covariance = points.reduce((sum, point) => sum + (point.ts - meanT) * (point.v - meanV), 0)
    const variance = points.reduce((sum, point) => sum + (point.ts - meanT) ** 2, 0)
    return variance === 0 ? 0 : covariance / variance
  }
}
