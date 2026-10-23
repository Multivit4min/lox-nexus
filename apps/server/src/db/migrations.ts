import type { Migration } from "./Migrator.ts"

/** The schema history. Append only: a released migration must never change. */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "initial",
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE miniservers (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        listen_port INTEGER NOT NULL,
        listen_address TEXT,
        own_id TEXT NOT NULL,
        remote_id TEXT NOT NULL,
        password TEXT,
        enabled INTEGER NOT NULL,
        resend_interval INTEGER NOT NULL
      );
      -- every addressable signal, whatever owns it, so wires get real foreign keys
      CREATE TABLE signals (
        id TEXT PRIMARY KEY,
        owner TEXT NOT NULL
      );
      CREATE TABLE loxone_signals (
        id TEXT PRIMARY KEY REFERENCES signals(id) ON DELETE CASCADE,
        miniserver_id TEXT NOT NULL REFERENCES miniservers(id),
        packet_id TEXT NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
        data_type INTEGER NOT NULL,
        label TEXT NOT NULL,
        slug TEXT,
        UNIQUE (miniserver_id, direction, packet_id)
      );
      CREATE TABLE wires (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        source_id TEXT NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
        target_id TEXT NOT NULL UNIQUE REFERENCES signals(id) ON DELETE CASCADE,
        transforms TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        sync_on_start INTEGER NOT NULL
      );
      CREATE TABLE forces (
        topic TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        forced_by TEXT NOT NULL,
        reason TEXT,
        until INTEGER,
        at INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('state', 'command'))
      );
      CREATE TABLE value_snapshot (
        topic TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        ts INTEGER NOT NULL
      );
    `
  },
  {
    version: 2,
    name: "load_samples",
    sql: `
      -- intercommunication load history (IntercomLoad), one hour per Miniserver
      CREATE TABLE load_samples (
        miniserver_id TEXT NOT NULL REFERENCES miniservers(id) ON DELETE CASCADE,
        ts INTEGER NOT NULL,
        incoming REAL NOT NULL,
        outgoing REAL NOT NULL,
        percent REAL NOT NULL,
        PRIMARY KEY (miniserver_id, ts)
      ) WITHOUT ROWID;
    `
  }
]
