import type { PluginInstanceConfig } from "@lox-nexus/core"
import type { Database } from "../Database.ts"

/** A row of `plugin_instances`: config is JSON text, enabled a 0/1 integer. */
interface PluginInstanceRow {
  id: string
  plugin: string
  slug: string
  label: string
  config: string
  /** NULL: saved before plugins had config versions, i.e. version 1 */
  config_version: number | null
  enabled: number
}

/** Plugin instances. Their signals and store rows go with them on delete. */
export class PluginInstanceRepository {
  constructor(private readonly db: Database) {}

  /** ordered by label for a stable UI */
  list(): PluginInstanceConfig[] {
    return this.db.all<PluginInstanceRow>("SELECT * FROM plugin_instances ORDER BY label, id").map(PluginInstanceRepository.toConfig)
  }

  /** undefined for unknown ids */
  get(id: string): PluginInstanceConfig | undefined {
    const row = this.db.get<PluginInstanceRow>("SELECT * FROM plugin_instances WHERE id = :id", { id })
    return row && PluginInstanceRepository.toConfig(row)
  }

  /** inserts or replaces by id; @throws on a slug another instance has (unique) */
  save(instance: PluginInstanceConfig) {
    this.db.run(
      `INSERT INTO plugin_instances (id, plugin, slug, label, config, config_version, enabled) VALUES (:id, :plugin, :slug, :label, :config, :configVersion, :enabled)
       ON CONFLICT (id) DO UPDATE SET slug = excluded.slug, label = excluded.label, config = excluded.config, config_version = excluded.config_version,
         enabled = excluded.enabled`,
      {
        id: instance.id, plugin: instance.plugin, slug: instance.slug, label: instance.label, config: JSON.stringify(instance.config ?? {}),
        configVersion: instance.configVersion ?? null, enabled: instance.enabled ? 1 : 0
      }
    )
  }

  /** the config a plugin migrated at start; nothing happens for an instance deleted meanwhile */
  saveConfig(id: string, config: unknown, configVersion: number) {
    this.db.run("UPDATE plugin_instances SET config = :config, config_version = :configVersion WHERE id = :id", { id, config: JSON.stringify(config ?? {}), configVersion })
  }

  /** deletes the instance with its signals (and through them their wires) and its store */
  delete(id: string) {
    this.db.transaction(() => {
      this.db.run("DELETE FROM signals WHERE id IN (SELECT id FROM plugin_signals WHERE instance_id = :id)", { id })
      this.db.run("DELETE FROM plugin_instances WHERE id = :id", { id })
    })
  }

  // unreadable config JSON becomes an empty object; the plugin then reports what is missing
  private static toConfig(row: PluginInstanceRow): PluginInstanceConfig {
    let config: unknown = {}
    try {
      config = JSON.parse(row.config)
    } catch {
      // keep {}
    }
    return {
      id: row.id, plugin: row.plugin, slug: row.slug, label: row.label, config, ...(row.config_version === null ? {} : { configVersion: row.config_version }),
      enabled: row.enabled === 1
    }
  }
}
