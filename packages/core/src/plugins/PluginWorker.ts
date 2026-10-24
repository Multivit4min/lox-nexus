import { EventEmitter } from "node:events"
import { createInterface } from "node:readline"
import { pathToFileURL } from "node:url"
import { Worker } from "node:worker_threads"
import { WIRE_VERSION, WorkerMessageSchema, type HostMessage, type PluginWorkerData } from "@lox-nexus/plugin-sdk/wire"
import type { PluginConnection, PluginConnectionEvents, PluginTransport } from "./PluginTransport.ts"

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
  private readonly worker: Worker
  private failure: string | undefined
  private gone = false

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
      createInterface({ input: this.worker[stream] }).on("line", line => this.emit("output", stream, line))
    }
  }

  send(message: HostMessage) {
    if (!this.gone) this.worker.postMessage(message)
  }

  async terminate() {
    if (!this.gone) await this.worker.terminate()
  }

  private receive(raw: unknown) {
    const parsed = WorkerMessageSchema.safeParse(raw)
    if (parsed.success) this.emit("message", parsed.data)
    else this.emit("invalid", `sent an invalid message: ${parsed.error.issues[0]?.message ?? "unknown"}`)
  }
}

/** The default transport: a worker thread per plugin instance. */
export class WorkerTransport implements PluginTransport {
  constructor(private readonly options: WorkerOptions = {}) {}

  open(entry: string) {
    return new PluginWorker(entry, this.options)
  }
}
