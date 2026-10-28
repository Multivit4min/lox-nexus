import type { Migration } from "./Migrator.ts"

/** Migration 6, in its own file to keep migrations.ts within the size limit: settings, and which signals the history and exporters take. */
export const SELECTIONS_MIGRATION: Migration = {
  version: 6,
  name: "settings_and_selections",
  sql: `
    -- one JSON value per key, validated by whoever owns the key
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    -- consumer: "history", or the id of a plugin instance that watches signals
    CREATE TABLE selection_modes (
      consumer TEXT PRIMARY KEY,
      mode TEXT NOT NULL CHECK (mode IN ('all', 'selected'))
    );
    -- a rule names exactly one signal, Miniserver or plugin instance, and goes with it
    CREATE TABLE selection_rules (
      consumer TEXT NOT NULL,
      signal_id TEXT REFERENCES signals(id) ON DELETE CASCADE,
      miniserver_id TEXT REFERENCES miniservers(id) ON DELETE CASCADE,
      instance_id TEXT REFERENCES plugin_instances(id) ON DELETE CASCADE,
      include INTEGER NOT NULL CHECK (include IN (0, 1)),
      CHECK ((signal_id IS NOT NULL) + (miniserver_id IS NOT NULL) + (instance_id IS NOT NULL) = 1)
    );
    -- NULLs are distinct in a UNIQUE constraint, so one partial index per target kind; the target
    -- comes first, so the foreign keys' cascading deletes find their rows by index
    CREATE UNIQUE INDEX selection_rules_signal ON selection_rules(signal_id, consumer) WHERE signal_id IS NOT NULL;
    CREATE UNIQUE INDEX selection_rules_miniserver ON selection_rules(miniserver_id, consumer) WHERE miniserver_id IS NOT NULL;
    CREATE UNIQUE INDEX selection_rules_instance ON selection_rules(instance_id, consumer) WHERE instance_id IS NOT NULL;
    CREATE INDEX selection_rules_consumer ON selection_rules(consumer);
  `
}
