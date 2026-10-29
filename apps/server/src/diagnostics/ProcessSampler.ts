import { monitorEventLoopDelay, performance, type EventLoopUtilization, type ELDHistogram } from "node:perf_hooks"
import { Disposable } from "@lox-nexus/plugin-sdk"

/** The Nexus process itself between two samples; bytes and milliseconds. */
export interface ProcessFigures {
  rss: number
  heapUsed: number
  heapTotal: number
  external: number
  arrayBuffers: number
  cpuPercent: number
  loopDelayP50: number
  loopDelayP99: number
  loopDelayMax: number
  loopUtilization: number
}

/**
 * the histogram's timer period: it wakes the loop this often for as long as Nexus runs, so not
 * finer than p99 and max of a 30 s sample need
 */
const RESOLUTION_MS = 20

// the histogram records the whole time between two of its timer ticks; only what exceeds the period is delay
const delayMs = (nanoseconds: number) => Math.max(0, Math.round((nanoseconds / 1e6 - RESOLUTION_MS) * 100) / 100)

/**
 * Memory, CPU and event loop of the process. Each sample() covers the time since the previous one:
 * the delay histogram is reset, and CPU and loop utilization are measured as deltas of one reading
 * each. A stall that starts right before a reset is missed, since the histogram's first interval
 * after a reset isn't recorded.
 */
export class ProcessSampler extends Disposable {
  private readonly delay: ELDHistogram = monitorEventLoopDelay({ resolution: RESOLUTION_MS })
  private cpu = process.cpuUsage()
  private at = performance.now()
  private loop: EventLoopUtilization = performance.eventLoopUtilization()

  constructor() {
    super()
    this.delay.enable()
    this.onDispose(() => void this.delay.disable())
  }

  sample(): ProcessFigures {
    const memory = process.memoryUsage()
    const now = performance.now()
    const cpuNow = process.cpuUsage()
    const loopNow = performance.eventLoopUtilization()
    const cpuMicros = cpuNow.user - this.cpu.user + cpuNow.system - this.cpu.system
    const elapsed = now - this.at
    const figures: ProcessFigures = {
      rss: memory.rss, heapUsed: memory.heapUsed, heapTotal: memory.heapTotal, external: memory.external, arrayBuffers: memory.arrayBuffers,
      cpuPercent: elapsed > 0 ? Math.round((cpuMicros / 1000 / elapsed) * 1000) / 10 : 0,
      // an empty histogram (no tick since the reset) reports 0
      loopDelayP50: this.delay.count ? delayMs(this.delay.percentile(50)) : 0,
      loopDelayP99: this.delay.count ? delayMs(this.delay.percentile(99)) : 0,
      loopDelayMax: this.delay.count ? delayMs(this.delay.max) : 0,
      loopUtilization: Math.round(performance.eventLoopUtilization(loopNow, this.loop).utilization * 10_000) / 10_000
    }
    this.cpu = cpuNow
    this.at = now
    this.loop = loopNow
    this.delay.reset()
    return figures
  }
}
