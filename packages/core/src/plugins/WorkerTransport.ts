import { PluginWorker, type WorkerOptions } from "./PluginWorker.ts"
import type { OpenOptions, PluginTransport } from "./PluginTransport.ts"

/** The default transport: a worker thread per plugin instance. */
export class WorkerTransport implements PluginTransport {
  constructor(private readonly options: WorkerOptions = {}) {}

  // the plugin's own heap limit wins over the transport's default
  open(entry: string, options: OpenOptions = {}) {
    return new PluginWorker(entry, { ...this.options, ...(options.heapMb === undefined ? {} : { heapMb: options.heapMb }) })
  }
}
