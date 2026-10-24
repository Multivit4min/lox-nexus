import { isMainThread, parentPort, workerData } from "node:worker_threads"
import type { PluginClass } from "../plugin/Plugin.ts"
import { PluginRuntime } from "./PluginRuntime.ts"

/** workerData the host passes to every plugin worker, so a module can tell it was started by Nexus */
export interface PluginWorkerData {
  loxNexus: number
}

/**
 * The one line a plugin's entry module needs:
 *
 * ```ts
 * export default PluginEntry.define(FroniusPlugin)
 * ```
 *
 * Loaded by Nexus as a plugin worker, it starts the runtime for the class. Imported anywhere else
 * (tests, tools) it only returns the class.
 */
export class PluginEntry {
  static define<T extends PluginClass>(type: T): T {
    const data = workerData as Partial<PluginWorkerData> | undefined
    if (isMainThread || !parentPort || typeof data?.loxNexus !== "number") return type
    const port = parentPort
    const runtime = new PluginRuntime(type, message => port.postMessage(message))
    port.on("message", (message: unknown) => void runtime.handle(message))
    runtime.hello()
    return type
  }
}
