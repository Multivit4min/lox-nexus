import type { PluginStore } from "../plugin/PluginContext.ts"
import type { WorkerMessage } from "../wire/WorkerMessages.ts"

/** The plugin's key-value store: an in-memory copy of what the host persisted, with writes sent back. */
export class RuntimeStore implements PluginStore {
  private readonly values: Map<string, unknown>

  constructor(initial: Record<string, unknown>, private readonly send: (message: WorkerMessage) => void) {
    this.values = new Map(Object.entries(initial))
  }

  get<T = unknown>(key: string): T | undefined {
    return this.values.get(key) as T | undefined
  }

  /**
   * @throws Error for an empty or overlong key, undefined (use delete()), or a value JSON can't
   * hold (BigInt, circular objects); the host stores values as JSON
   */
  set(key: string, value: unknown) {
    if (key.length === 0 || key.length > 200) throw new Error("store keys must have 1 to 200 characters")
    if (value === undefined) throw new Error(`store value for "${key}" is undefined; use delete() to remove a key`)
    // the round trip throws here, at the plugin's call, instead of in the host; it also drops what JSON would drop
    const copy: unknown = JSON.parse(JSON.stringify(value))
    this.values.set(key, copy)
    this.send({ type: "store.set", key, value: copy })
  }

  delete(key: string) {
    if (this.values.delete(key)) this.send({ type: "store.delete", key })
  }

  keys() {
    return [...this.values.keys()]
  }
}
