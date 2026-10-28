/**
 * Counters and the latest state of the export, for the panel. In memory only: they start at zero
 * with every start of the instance.
 */
export class ExportStats {
  /** what the writer does now, in words */
  state = "waiting for values"
  written = 0
  /** dropped by InfluxDB's refusal of a batch (bad data), not retried */
  rejected = 0
  /** values Nexus left out because the export fell behind (`dropped` of watched()) */
  droppedByNexus = 0
  /** values that gave no point: null values, values of signals not in the watch list (and, defensively, numbers line protocol can't carry) */
  skipped = 0
  lastSuccessAt: number | undefined
  lastError: { at: number; message: string } | undefined
  lastLatencyMs: number | undefined

  succeeded(points: number, latencyMs: number, now = Date.now()) {
    this.written += points
    this.lastSuccessAt = now
    this.lastLatencyMs = latencyMs
    this.state = "ok"
  }

  failed(message: string, state: string, now = Date.now()) {
    this.lastError = { at: now, message }
    this.state = state
  }

  refused(points: number, message: string, now = Date.now()) {
    this.rejected += points
    this.lastError = { at: now, message }
    this.state = "ok, the last batch was rejected"
  }
}
