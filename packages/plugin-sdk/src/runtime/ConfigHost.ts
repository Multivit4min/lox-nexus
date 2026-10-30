import { z } from "zod"
import type { PluginClass } from "../plugin/Plugin.ts"
import type { PluginStore } from "../plugin/PluginContext.ts"
import { Declarations } from "./Declarations.ts"
import { MessageLimits } from "./MessageLimits.ts"
import { RuntimeStore } from "./RuntimeStore.ts"

/** A problem with one setting; `path` leads to the field, e.g. ["devices", 2, "name"]. */
export interface ConfigIssue {
  path: (string | number)[]
  message: string
}

/** What a settings check answers; `store` only when the host passed the instance's store. */
export interface ConfigCheckResult {
  issues: ConfigIssue[]
  config: unknown
  version: number
  store?: { set: Record<string, unknown>; delete: string[] }
}

/**
 * A plugin's settings without the plugin running: migrating a stored config to the current
 * version, checking one before it is saved, and the plugin's connection test.
 */
export class ConfigHost {
  /** what the worker tells the host in hello, so only it gets config.check and config.test */
  static readonly FEATURE = "config.check"

  constructor(private readonly type: PluginClass) {}

  /** the version configs are saved with now */
  get version() {
    const declared = this.type.configVersion
    return typeof declared === "number" && Number.isInteger(declared) && declared >= 1 ? declared : 1
  }

  /** the config in the current shape; `migrated` when migrateConfig ran. A newer version is left as it is. */
  async migrate(config: unknown, from: number | undefined, store: PluginStore) {
    const start = from ?? 1
    if (!this.type.migrateConfig || start >= this.version) return { config, migrated: false }
    return { config: await this.type.migrateConfig({ config, from: start, store }), migrated: true }
  }

  /**
   * Migrates, then validates: the issues at their fields, and the config to save. Without `from`
   * the config is taken as current (a new instance's form). The migration works on a copy of
   * `store` (empty without one); with a store, what it wrote comes back for the host to apply.
   */
  async check(config: unknown, from: number | undefined, store?: Record<string, unknown>): Promise<ConfigCheckResult> {
    const writes = { set: {} as Record<string, unknown>, delete: [] as string[] }
    // the last write of a key wins, a set after a delete too
    const copy = new RuntimeStore(store ?? {}, message => {
      if (message.type === "store.set") {
        writes.set[message.key] = message.value
        writes.delete = writes.delete.filter(key => key !== message.key)
      }
      if (message.type === "store.delete") {
        delete writes.set[message.key]
        writes.delete.push(message.key)
      }
    })
    const migrated = await this.migrate(config, from ?? this.version, copy)
    const parsed = Declarations.config(this.type).safeParse(migrated.config)
    const issues = parsed.success ? [] : parsed.error.issues.map(issue => ({
      path: issue.path.map(part => (typeof part === "number" ? part : String(part))), message: issue.message
    }))
    return { issues, config: migrated.config, version: this.version, ...(store ? { store: writes } : {}) }
  }

  /**
   * The plugin's connection test with a valid config.
   * @returns its message, if any
   * @throws Error for an invalid config, a plugin without a test, or the test's own failure
   */
  async test(config: unknown): Promise<string | undefined> {
    if (!this.type.test) throw new Error(`${this.type.name} has no connection test`)
    const parsed = Declarations.config(this.type).safeParse(config)
    if (!parsed.success) throw new Error(`invalid config: ${z.prettifyError(parsed.error)}`)
    const message = await this.type.test(parsed.data as never)
    return typeof message === "string" ? MessageLimits.clip(message) : undefined
  }
}
