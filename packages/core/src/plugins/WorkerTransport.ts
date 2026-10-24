import { PluginWorker, type WorkerOptions } from "./PluginWorker.ts"
import type { PluginTransport } from "./PluginTransport.ts"

/** The default transport: a worker thread per plugin instance. */
export class WorkerTransport implements PluginTransport {
  constructor(private readonly options: WorkerOptions = {}) {}

  open(entry: string) {
    return new PluginWorker(entry, this.options)
  }
}
