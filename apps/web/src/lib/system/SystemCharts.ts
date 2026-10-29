import type { DiagnosticsSampleDto } from "@lox-nexus/api"
import type { MetricSeries } from "./MetricChartGeometry.ts"

export type MetricUnit = "bytes" | "ms" | "percent" | "perSecond"

/** One chart of the System page: lines of the same unit, so they share one axis. */
export interface ChartSpec {
  id: string
  title: string
  unit: MetricUnit
  series: MetricSeries[]
  /** said under the chart, e.g. that more lines are in the CSV */
  note?: string
}

/** at most this many lines per chart: the categorical palette has eight colours */
const MAX_LINES = 8
const MIB = 1024 * 1024

/** Turns diagnostics samples into the System page's charts and formats their values. */
export class SystemCharts {
  static build(samples: DiagnosticsSampleDto[]): ChartSpec[] {
    const line = (name: string, read: (sample: DiagnosticsSampleDto) => number, peak = false): MetricSeries =>
      ({ name, points: samples.map(sample => ({ ts: sample.ts, v: read(sample) })), ...(peak ? { peak: true as const } : {}) })
    return [
      { id: "memory", title: "Memory of the Nexus process", unit: "bytes", series: [line("RSS", s => s.rss), line("Heap total", s => s.heapTotal), line("Heap used", s => s.heapUsed)] },
      { id: "loop", title: "Event loop delay", unit: "ms", series: [line("p50", s => s.loopDelayP50), line("p99", s => s.loopDelayP99, true), line("max", s => s.loopDelayMax, true)] },
      { id: "cpu", title: "CPU and event loop use", unit: "percent", series: [line("CPU (of one core)", s => s.cpuPercent), line("Event loop busy", s => s.loopUtilization * 100)] },
      { id: "bus", title: "Bus messages", unit: "perSecond", series: [line("Messages", s => s.busPerSecond)] },
      SystemCharts.capped("workers", "Plugin worker heaps", "bytes", SystemCharts.workerHeaps(samples)),
      SystemCharts.capped("miniservers", "Miniserver traffic (in + out)", "perSecond",
        SystemCharts.perEntity(samples, s => s.miniservers.map(ms => ({ id: ms.id, name: ms.label, v: ms.incomingPerSecond + ms.outgoingPerSecond })))),
      { id: "storage", title: "Storage", unit: "bytes", series: [line("Database", s => s.databaseBytes), line("History", s => s.historyBytes), line("Plugins", s => s.pluginsBytes)] }
    ]
  }

  static format(unit: MetricUnit, v: number): string {
    switch (unit) {
      case "bytes": return v >= 1024 * MIB ? `${(v / 1024 / MIB).toFixed(2)} GiB` : `${(v / MIB).toFixed(1)} MiB`
      case "ms": return `${v.toFixed(v < 10 ? 2 : 0)} ms`
      case "percent": return `${v.toFixed(1)} %`
      case "perSecond": return `${v.toFixed(v < 10 ? 1 : 0)}/s`
    }
  }

  /** a heap line per plugin instance, all of them (the chart shows eight) */
  static workerHeaps(samples: DiagnosticsSampleDto[]): MetricSeries[] {
    return SystemCharts.perEntity(samples, s => s.workers.map(w => ({ id: w.instanceId, name: w.label, v: w.heapUsed })))
  }

  private static capped(id: string, title: string, unit: MetricUnit, all: MetricSeries[]): ChartSpec {
    const more = all.length - MAX_LINES
    return { id, title, unit, series: all.slice(0, MAX_LINES), ...(more > 0 ? { note: `${more} more in the CSV download` } : {}) }
  }

  // a line per plugin instance or Miniserver, in order of first appearance, under its latest name; points only where it ran
  private static perEntity(samples: DiagnosticsSampleDto[], read: (sample: DiagnosticsSampleDto) => Array<{ id: string; name: string; v: number }>): MetricSeries[] {
    const lines = new Map<string, MetricSeries>()
    for (const sample of samples) {
      for (const entry of read(sample)) {
        const line = lines.get(entry.id) ?? { name: entry.name, points: [] }
        line.name = entry.name
        line.points.push({ ts: sample.ts, v: entry.v })
        lines.set(entry.id, line)
      }
    }
    return [...lines.values()]
  }
}
