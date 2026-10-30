import type { PluginSignalConfig } from "@lox-nexus/core"
import type { Database } from "../Database.ts"
import { SignalDisplayColumns, type SignalDisplayRow } from "./SignalDisplayColumns.ts"

/** A row of `plugin_signals`; params is JSON text. */
interface PluginSignalRow extends SignalDisplayRow {
  id: string
  instance_id: string
  kind: "sensor" | "actuator"
  capability: string
  params: string
  label: string
  slug: string
}

/** Plugin sensors and actuators, with a row in the `signals` supertable so wires can reference them. */
export class PluginSignalRepository {
  /** value of `signals.owner` for rows written here */
  static readonly OWNER = "plugin"

  constructor(private readonly db: Database) {}

  /** ordered by label for a stable UI */
  listFor(instanceId: string): PluginSignalConfig[] {
    return this.db.all<PluginSignalRow>("SELECT * FROM plugin_signals WHERE instance_id = :instanceId ORDER BY label, id", { instanceId })
      .map(PluginSignalRepository.toConfig)
  }

  /** both rows atomically; @throws on a slug the instance already uses for that kind (unique) */
  insert(instanceId: string, signal: PluginSignalConfig) {
    this.db.transaction(() => {
      this.db.run("INSERT INTO signals (id, owner) VALUES (:id, :owner)", { id: signal.id, owner: PluginSignalRepository.OWNER })
      this.db.run(
        `INSERT INTO plugin_signals (id, instance_id, kind, capability, params, label, slug, unit, decimals)
         VALUES (:id, :instanceId, :kind, :capability, :params, :label, :slug, :unit, :decimals)`,
        { ...PluginSignalRepository.params(signal), instanceId }
      )
    })
  }

  /** @throws TypeError (a 500: runtime and database disagree) when the signal is not stored for that instance */
  update(instanceId: string, signal: PluginSignalConfig) {
    const { changes } = this.db.run(
      `UPDATE plugin_signals SET kind = :kind, capability = :capability, params = :params, label = :label, slug = :slug,
         ${SignalDisplayColumns.ASSIGN}
       WHERE id = :id AND instance_id = :instanceId`,
      { ...PluginSignalRepository.params(signal), instanceId }
    )
    if (changes !== 1) throw new TypeError(`plugin signal "${signal.id}" is not stored for instance "${instanceId}"`)
  }

  /** deleting the supertable row cascades to plugin_signals and to the signal's wires */
  delete(id: string) {
    this.db.run("DELETE FROM signals WHERE id = :id", { id })
  }

  private static params(signal: PluginSignalConfig) {
    return {
      id: signal.id, kind: signal.kind, capability: signal.capability, params: JSON.stringify(signal.params ?? {}), label: signal.label, slug: signal.slug,
      ...SignalDisplayColumns.params(signal)
    }
  }

  // unreadable params JSON becomes {}; the plugin then refuses the signal with a reason
  private static toConfig(row: PluginSignalRow): PluginSignalConfig {
    let params: unknown = {}
    try {
      params = JSON.parse(row.params)
    } catch {
      // keep {}
    }
    return { id: row.id, kind: row.kind, capability: row.capability, params, label: row.label, slug: row.slug, ...SignalDisplayColumns.read(row) }
  }
}
