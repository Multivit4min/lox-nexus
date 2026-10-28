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
 * Loaded by Nexus as a plugin worker, it starts the runtime for the class and routes unhandled
 * promise rejections to `Plugin.unhandledRejection` instead of letting them end the worker.
 * Imported anywhere else (tests, tools) it only returns the class.
 */
export class PluginEntry {
  /** @returns `type` itself, so it can be the module's default export */
  static define<T extends PluginClass>(type: T): T {
    const data = workerData as Partial<PluginWorkerData> | undefined
    if (isMainThread || !parentPort || typeof data?.loxNexus !== "number") return type
    const port = parentPort
    const runtime = new PluginRuntime(type, message => port.postMessage(message))
    port.on("message", (message: unknown) => void runtime.handle(message))
    // Node ends a thread on an unhandled rejection; one forgotten .catch would crash-loop the plugin
    process.on("unhandledRejection", reason => runtime.rejected(reason))
    runtime.hello()
    return type
  }
}
