import type { Panel } from "@lox-nexus/plugin-sdk"
import type { ExportStats } from "./ExportStats.ts"

/** What the panel shows besides the stats. */
export interface PanelFacts {
  /** where the points go, without credentials */
  target: string
  watchedSignals: number
  /** points not written yet */
  buffered: number
  bufferCapacity: number
  /** dropped because the buffer was full */
  droppedFull: number
}

/**
 * Two sections: the export (state, target, last success and error) and the point counters.
 * Never shows the token or password; the target comes from WriteEndpoint.description.
 */
export class InfluxPanel {
  constructor(private readonly stats: ExportStats, private readonly facts: PanelFacts) {}

  build(): Panel {
    return {
      type: "sections",
      sections: [
        { title: "Export", panel: { type: "keyValue", items: this.export() } },
        { title: "Points", panel: { type: "keyValue", items: this.points() } }
      ]
    }
  }

  private export() {
    const { stats, facts } = this
    const error = stats.lastError
    return [
      { label: "State", value: stats.state },
      { label: "Target", value: facts.target },
      { label: "Watched signals", value: facts.watchedSignals === 0 ? "none chosen yet" : String(facts.watchedSignals) },
      { label: "Last success", value: InfluxPanel.time(stats.lastSuccessAt) },
      { label: "Last error", value: error ? `${InfluxPanel.time(error.at)}: ${error.message}` : "none" },
      { label: "Last latency", value: stats.lastLatencyMs === undefined ? "–" : `${stats.lastLatencyMs} ms` }
    ]
  }

  private points() {
    const { stats, facts } = this
    return [
      { label: "Written", value: InfluxPanel.count(stats.written) },
      { label: "Buffered", value: `${InfluxPanel.count(facts.buffered)} of ${InfluxPanel.count(facts.bufferCapacity)}` },
      { label: "Dropped (buffer full)", value: InfluxPanel.count(facts.droppedFull) },
      { label: "Dropped by Nexus (export behind)", value: InfluxPanel.count(stats.droppedByNexus) },
      { label: "Rejected by InfluxDB", value: InfluxPanel.count(stats.rejected) },
      { label: "Skipped (null or unknown signal)", value: InfluxPanel.count(stats.skipped) }
    ]
  }

  private static count(value: number) {
    return value.toLocaleString("en-US")
  }

  private static time(at: number | undefined) {
    return at === undefined ? "never" : new Date(at).toISOString()
  }
}
