import { createHash } from "node:crypto"
import { z, type PluginStore } from "@lox-nexus/plugin-sdk"
import { fromJson, MemoryStorageDriver, toJson, type SupportedStorageTypes } from "@matter/main"
import type { WriteCoalescer } from "./WriteCoalescer.ts"

type Values = Record<string, SupportedStorageTypes>

/** what one store key holds: the context path (a hashed key can't be read back) and matter.js's own JSON */
const entrySchema = z.object({ context: z.string(), json: z.string() })
type Entry = z.infer<typeof entrySchema>

export interface StoreStorageOptions {
  /** called for a damaged entry and when a context grows close to the store's value limit */
  warn?(message: string): void
  /** merges bursts of device state writes; without one every write goes to the store at once */
  coalescer?: WriteCoalescer
}

/**
 * matter.js storage on the plugin store, so fabric keys and certificates live in Nexus's database
 * (and its encrypted backup) instead of files. One store key per leaf storage context keeps each
 * value far below the store's 1 MiB limit; matter.js's `toJson()` carries `Uint8Array` and `bigint`.
 * Fabrics, sessions, endpoint numbers and everything else of the node are written at once; only
 * the attribute state of the devices' behaviors (`root.parts.….parts.<endpoint>.<behavior>`)
 * goes through the coalescer.
 */
export class StoreStorageDriver extends MemoryStorageDriver {
  static readonly PREFIX = "matter:"
  /** the store's key limit is 200 characters */
  static readonly MAX_KEY = 200
  /** the store refuses values over 1 MiB as JSON; warn well before */
  static readonly WARN_LENGTH = 900 * 1024

  private readonly prefix: string

  /** @param namespace matter.js's storage namespace (the node id) */
  constructor(private readonly target: PluginStore, namespace: string, private readonly options: StoreStorageOptions = {}) {
    const prefix = `${StoreStorageDriver.PREFIX}${namespace}/`
    super(StoreStorageDriver.load(target, prefix, options.warn))
    this.prefix = prefix
    this.initialize()
  }

  override set(contexts: string[], keyOrValues: string | Values, value?: SupportedStorageTypes) {
    super.set(contexts, keyOrValues, value)
    this.changed(contexts.join("."))
  }

  override delete(contexts: string[], key: string) {
    super.delete(contexts, key)
    this.changed(contexts.join("."))
  }

  override clearAll(contexts: string[]) {
    const path = contexts.join(".")
    super.clearAll(contexts)
    for (const key of this.target.keys()) {
      const context = this.contextOf(key)
      if (context !== undefined && (path === "" || context === path || context.startsWith(`${path}.`))) this.target.delete(key)
    }
  }

  override async close() {
    this.options.coalescer?.flush()
    await super.close()
  }

  /** the store key of a context path: readable, or shortened with a hash when too long */
  keyOf(context: string) {
    const key = this.prefix + context
    if (key.length <= StoreStorageDriver.MAX_KEY) return key
    const hash = createHash("sha256").update(context).digest("hex").slice(0, 16)
    return `${key.slice(0, StoreStorageDriver.MAX_KEY - hash.length - 1)}#${hash}`
  }

  private changed(context: string) {
    const { coalescer } = this.options
    if (coalescer && StoreStorageDriver.isDeviceState(context)) coalescer.write(this.keyOf(context), () => this.persist(context))
    else this.persist(context)
  }

  /** a behavior's state on an endpoint below the root: `root.parts.devices.parts.<id>.onOff` */
  static isDeviceState(context: string) {
    const segments = context.split(".")
    return segments[0] === "root" && segments.length >= 4 && segments.at(-3) === "parts"
  }

  private persist(context: string) {
    const values = this.data[context]
    const key = this.keyOf(context)
    if (values === undefined || Object.keys(values).length === 0) {
      if (this.target.get(key) !== undefined) this.target.delete(key)
      return
    }
    const entry: Entry = { context, json: toJson(values) }
    // the length the store measures: the stored value as JSON
    const length = JSON.stringify(entry).length
    if (length > StoreStorageDriver.WARN_LENGTH) this.options.warn?.(`matter.js storage context "${context}" holds ${Math.round(length / 1024)} KiB; the store refuses more than 1 MiB per key`)
    this.target.set(key, entry)
  }

  private contextOf(key: string) {
    if (!key.startsWith(this.prefix)) return undefined
    return entrySchema.safeParse(this.target.get(key)).data?.context
  }

  /** what an earlier run stored; a damaged entry is skipped with a warning instead of failing the start */
  private static load(store: PluginStore, prefix: string, warn?: (message: string) => void) {
    const data: Record<string, Values> = {}
    for (const key of store.keys()) {
      if (!key.startsWith(prefix)) continue
      const entry = entrySchema.safeParse(store.get(key)).data
      try {
        if (!entry) throw new Error("not a storage entry")
        data[entry.context] = fromJson(entry.json) as Values
      } catch (error) {
        warn?.(`ignored the damaged matter.js storage entry "${key}": ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return data
  }
}
