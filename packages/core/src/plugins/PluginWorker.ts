import { EventEmitter } from "node:events"
import { createInterface } from "node:readline"
import { pathToFileURL } from "node:url"
import type { EventLoopUtilization } from "node:perf_hooks"
import { Worker } from "node:worker_threads"
import { WIRE_VERSION, WorkerMessageSchema, type HostMessage, type PluginWorkerData } from "@lox-nexus/plugin-sdk/wire"
import type { ConnectionStats, PluginConnection, PluginConnectionEvents } from "./PluginTransport.ts"

/** Options for the worker of each plugin. */
export interface WorkerOptions {
  /** old-generation heap limit; the worker dies with "out of memory" beyond it */
  heapMb?: number
}

/**
 * One plugin in a worker thread, with an empty environment and a heap limit. Worker threads are
 * not a sandbox (ADR 0001): plugins are trusted code. Messages from the worker are validated
 * before anyone sees them; stdout and stderr are split into lines and reported as `output`.
 */
export class PluginWorker extends EventEmitter<PluginConnectionEvents> implements PluginConnection {
  static readonly HEAP_MB = 128
  /** longer stdout/stderr lines are cut, so one runaway print can't flood the log */
  static readonly MAX_LINE = 10_000
  private static readonly KNOWN_TYPES: ReadonlySet<string> = new Set(WorkerMessageSchema.options.map(option => option.shape.type.value))
  private readonly worker: Worker
  private failure: string | undefined
  private gone = false
  private lastLoop: EventLoopUtilization | undefined

  /** Starts the worker at once; it inherits the host's execArgv, so `--import tsx` runs TypeScript entries in development. */
  constructor(entry: string, options: WorkerOptions = {}) {
    super()
    const workerData: PluginWorkerData = { loxNexus: WIRE_VERSION }
    const heapMb = options.heapMb ?? PluginWorker.HEAP_MB
    this.worker = new Worker(entry.startsWith("file:") ? new URL(entry) : pathToFileURL(entry), {
      workerData, env: {}, stdout: true, stderr: true, resourceLimits: { maxOldGenerationSizeMb: heapMb }
    })
    this.worker.on("message", (raw: unknown) => this.receive(raw))
    this.worker.on("error", (error: Error & { code?: string }) => {
      this.failure = error.code === "ERR_WORKER_OUT_OF_MEMORY" ? `out of memory (limit ${heapMb} MB)` : `crashed: ${error.message}`
    })
    this.worker.on("exit", (code: number) => {
      this.gone = true
      this.emit("exit", this.failure ?? `exited with code ${code}`)
    })
    for (const stream of ["stdout", "stderr"] as const) {
      createInterface({ input: this.worker[stream] }).on("line", line => this.emit("output", stream, line.slice(0, PluginWorker.MAX_LINE)))
    }
  }

  /** dropped silently once the worker is gone; the exit event already told the session */
  send(message: HostMessage) {
    if (!this.gone) this.worker.postMessage(message)
  }

  async terminate() {
    if (!this.gone) await this.worker.terminate()
  }

  async stats(): Promise<ConnectionStats | undefined> {
    if (this.gone) return undefined
    try {
      const heap = await this.worker.getHeapStatistics()
      const loop = this.worker.performance.eventLoopUtilization()
      // from the raw totals, clamped: a worker's "active" comes from two clocks and jitters by
      // fractions of a millisecond, so readings close together can give a delta below zero
      const active = loop.active - (this.lastLoop?.active ?? 0)
      const idle = loop.idle - (this.lastLoop?.idle ?? 0)
      this.lastLoop = loop
      const utilization = active + idle > 0 ? Math.min(1, Math.max(0, active / (active + idle))) : 0
      return { heapUsed: heap.used_heap_size, heapTotal: heap.total_heap_size, utilization }
    } catch {
      // the worker ended while it was asked
      return undefined
    }
  }

  // a type this host doesn't know comes from a newer SDK and is skipped; a known type with a wrong shape means the plugin is broken
  private receive(raw: unknown) {
    const parsed = WorkerMessageSchema.safeParse(raw)
    if (parsed.success) return void this.emit("message", parsed.data)
    const type = (raw as { type?: unknown } | null)?.type
    if (typeof type === "string" && !PluginWorker.KNOWN_TYPES.has(type)) {
      return void this.emit("output", "stderr", `ignored a message of unknown type "${type.slice(0, 50)}" (built with a newer SDK?)`)
    }
    this.emit("invalid", `sent an invalid message: ${parsed.error.issues[0]?.message ?? "unknown"}`)
  }
}
