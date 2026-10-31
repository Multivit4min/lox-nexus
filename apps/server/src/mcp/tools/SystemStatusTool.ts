import type { DiagnosticsDto } from "@lox-nexus/api"
import { z } from "zod"
import type { ChangeLock } from "../../http/ChangeLock.ts"
import type { McpTool } from "../McpTool.ts"

const Input = z.object({})
const MB = 1024 * 1024

/** How Nexus itself is doing: version, uptime, memory, CPU, event loop, traffic, plugin workers. */
export class SystemStatusTool implements McpTool<z.infer<typeof Input>> {
  readonly name = "system_status"
  readonly title = "System status"
  readonly description = "Nexus itself: version, uptime, memory, CPU, event loop delay, bus messages per second, plugin workers' memory, and whether a config import is running (changes wait then)."
  readonly scope = "read" as const
  readonly annotations = { readOnlyHint: true }
  readonly input = Input

  constructor(private readonly diagnostics: { snapshot(since?: number): DiagnosticsDto } | undefined, private readonly lock?: Pick<ChangeLock, "heldBy">) {}

  run() {
    const snapshot = this.diagnostics?.snapshot(Date.now() - 120_000)
    const sample = snapshot?.samples.at(-1)
    const heldBy = this.lock?.heldBy
    return {
      ...(snapshot ? { version: snapshot.version, node: snapshot.node, platform: snapshot.platform, uptimeH: Math.round((Date.now() - snapshot.startedAt) / 36_000) / 100 } : {}),
      ...(heldBy ? { busy: `${heldBy} is running` } : {}),
      ...(sample ? {
        sampledAt: new Date(sample.ts).toISOString(),
        rssMB: Math.round(sample.rss / MB), heapMB: Math.round(sample.heapUsed / MB), cpuPercent: Math.round(sample.cpuPercent),
        loopDelayP99Ms: Math.round(sample.loopDelayP99), busPerSecond: Math.round(sample.busPerSecond * 10) / 10, wires: sample.wires,
        workers: sample.workers.map(worker => `${worker.label}: ${Math.round(worker.heapUsed / MB)} MB, ${Math.round(worker.utilization * 100)} %`),
        miniservers: sample.miniservers.map(server => `${server.label}: ${server.incomingPerSecond.toFixed(1)} in/s, ${server.outgoingPerSecond.toFixed(1)} out/s`)
      } : { note: "no sample yet; the first comes 30 s after the start" })
    }
  }
}
