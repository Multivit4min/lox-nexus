import type { PluginStore } from "./PluginContext.ts"

/** What `static migrateConfig` gets: a stored config of an older `configVersion`. */
export interface ConfigMigration {
  /** the stored config, not validated: it has the shape of version `from` */
  config: unknown
  /** the version it was stored with; 1 for instances from before the plugin declared one. A lower bound: the config may already have newer fields */
  from: number
  /**
   * the instance's store, for moving data out of the config (e.g. a list that grew too big for
   * it). Writes are kept when the instance starts; a settings check works on a throwaway copy.
   */
  store: PluginStore
}
