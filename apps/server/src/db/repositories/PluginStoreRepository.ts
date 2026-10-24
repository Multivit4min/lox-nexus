import type { PluginStateStore } from "@lox-nexus/core"
import type { Database } from "../Database.ts"

/** The key-value store of each plugin instance (`plugin_store`); values are JSON text. */
export class PluginStoreRepository implements PluginStateStore {
  constructor(private readonly db: Database, private readonly warn: (message: string) => void) {}

  /** every key of the instance; a value that isn't valid JSON is skipped with a warning */
  load(instanceId: string): Record<string, unknown> {
    const rows = this.db.all<{ key: string; value: string }>("SELECT key, value FROM plugin_store WHERE instance_id = :instanceId", { instanceId })
    const values: Record<string, unknown> = {}
    for (const { key, value } of rows) {
      try {
        values[key] = JSON.parse(value)
      } catch {
        this.warn(`skipping unreadable store value "${key}" of plugin instance "${instanceId}"`)
      }
    }
    return values
  }

  // values the plugin sends are structured-cloned data; JSON drops what it can't express (undefined, Map)
  set(instanceId: string, key: string, value: unknown) {
    this.db.run(
      `INSERT INTO plugin_store (instance_id, key, value) VALUES (:instanceId, :key, :value)
       ON CONFLICT (instance_id, key) DO UPDATE SET value = excluded.value`,
      { instanceId, key, value: JSON.stringify(value ?? null) }
    )
  }

  delete(instanceId: string, key: string) {
    this.db.run("DELETE FROM plugin_store WHERE instance_id = :instanceId AND key = :key", { instanceId, key })
  }
}
