import { Plugin, type WatchedValue } from "@lox-nexus/plugin-sdk"
import { ExportStats } from "./ExportStats.ts"
import { influxConfigSchema, type InfluxConfig } from "./InfluxConfig.ts"
import { InfluxPanel } from "./InfluxPanel.ts"
import { LineProtocol } from "./line/LineProtocol.ts"
import { PointMapper } from "./line/PointMapper.ts"
import { RetryNowAction } from "./RetryNowAction.ts"
import { InfluxWriter } from "./write/InfluxWriter.ts"
import { ExportHealth } from "./write/ExportHealth.ts"
import { RetryPolicy } from "./write/RetryPolicy.ts"
import { WriteBuffer } from "./write/WriteBuffer.ts"
import { WriteEndpoint } from "./write/WriteEndpoint.ts"

/**
 * Exporter: writes the values of the signals the user chose on the instance page to InfluxDB
 * (1, 2 or 3), for Grafana and long-term storage. No sensors or actuators.
 *
 * watched() only maps and buffers, it never waits for the network, so Nexus can keep delivering
 * while InfluxDB is slow or down; the writer sends from the buffer on its own schedule.
 */
export class InfluxPlugin extends Plugin<InfluxConfig> {
  static readonly config = influxConfigSchema

  /**
   * Test connection: asks the server's health endpoint (/health, /ping for version 1), which
   * touches no data. It proves the address; whether the token may write shows at the first write.
   */
  static async test(config: InfluxConfig) {
    const endpoint = WriteEndpoint.fromConfig(config)
    const { status, body } = await endpoint.check(AbortSignal.timeout(10_000))
    if (status >= 300) throw new Error(`${endpoint.healthUrl.href} answered ${status}${body ? `: ${body}` : ""}`)
    return `Reached ${endpoint.description}. The ${config.api === "v2" ? "token" : "user"} is checked by the first write.`
  }
  static readonly watches = { label: "Exported signals", description: "Values of these signals are written to InfluxDB" }
  static readonly actions = [RetryNowAction]
  /** a request's timeout, and the time a stop gives the last write */
  static readonly TIMEOUT_MS = 15_000
  static readonly CLOSE_MS = 1500
  /** at most one warning about dropped values per this long */
  static readonly WARN_EVERY_MS = 60_000

  readonly stats = new ExportStats()
  readonly endpoint = WriteEndpoint.fromConfig(this.config)
  readonly buffer = new WriteBuffer(this.config.maxBufferedPoints)
  private readonly mapper = new PointMapper(this.config)
  readonly writer = this.own(new InfluxWriter(
    {
      endpoint: this.endpoint,
      buffer: this.buffer,
      policy: new RetryPolicy(this.config.api === "v2" ? "the token" : "the user and password"),
      health: new ExportHealth(this.stats, this.log, this.status),
      debug: (message, data) => this.log.debug(message, data)
    },
    { flushMs: this.config.flushSeconds * 1000, batchSize: this.config.batchSize, gzip: this.config.gzip, timeoutMs: InfluxPlugin.TIMEOUT_MS }
  ))

  private lastDropWarning = -Infinity

  override start() {
    this.writer.start()
    // registered after the writer, so it runs before the writer is disposed
    this.onDispose(() => this.writer.close(InfluxPlugin.CLOSE_MS))
    // tells the user about a wrong URL right away instead of with the first values; doesn't hold the start up
    void this.writer.check()
  }

  override watched(values: readonly WatchedValue[], dropped: number) {
    this.stats.droppedByNexus += dropped
    const lines: string[] = []
    for (const value of values) {
      if (value.initial && !this.config.writeInitial) continue
      // a batch always meets the list it was sent with, so an unknown signal is not expected
      const signal = this.watch.signal(value.signalId)
      const point = signal && this.mapper.map(value, signal)
      const line = point && LineProtocol.line(point)
      if (line === undefined) this.stats.skipped++
      else lines.push(line)
    }
    const overflow = this.buffer.add(lines)
    if (dropped > 0 || overflow > 0) this.warnDropped()
    this.writer.added()
  }

  override panel() {
    return new InfluxPanel(this.stats, {
      target: this.endpoint.description,
      watchedSignals: this.watch.signals().length,
      buffered: this.buffer.size,
      bufferCapacity: this.buffer.capacity,
      droppedFull: this.buffer.dropped
    }).build()
  }

  private warnDropped() {
    const now = Date.now()
    if (now - this.lastDropWarning < InfluxPlugin.WARN_EVERY_MS) return
    this.lastDropWarning = now
    this.log.warn("values are being dropped: the buffer is full or the export fell behind", {
      bufferFull: this.buffer.dropped,
      byNexus: this.stats.droppedByNexus
    })
  }
}
