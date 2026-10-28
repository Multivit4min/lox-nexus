import type { Migration } from "../Migrator.ts"

/** The schema of history.db, separate from the main database's. Append only. */
export const HISTORY_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "history",
    sql: `
      -- a small key per signal, so sample rows don't repeat a 36-character id
      CREATE TABLE series (
        id INTEGER PRIMARY KEY,
        signal_id TEXT NOT NULL UNIQUE,
        value_type TEXT NOT NULL,
        created INTEGER NOT NULL
      );
      -- every change (the raw tier); num for charts, text for text and composite details
      CREATE TABLE samples (
        series INTEGER NOT NULL,
        ts INTEGER NOT NULL,
        num REAL,
        text TEXT,
        flags INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (series, ts)
      ) WITHOUT ROWID;
      -- time-weighted buckets (5 min and 1 h), only where something changed; avg = wsum / wdur
      CREATE TABLE buckets (
        series INTEGER NOT NULL,
        width INTEGER NOT NULL,
        start INTEGER NOT NULL,
        min REAL,
        max REAL,
        wsum REAL NOT NULL,
        wdur INTEGER NOT NULL,
        n INTEGER NOT NULL,
        last REAL,
        flags INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (series, width, start)
      ) WITHOUT ROWID;
      -- when Nexus ran, so readers can tell "unchanged" from "Nexus was down"
      CREATE TABLE runs (
        started INTEGER PRIMARY KEY,
        seen INTEGER NOT NULL
      );
    `
  },
  {
    version: 2,
    name: "pauses",
    sql: `
      -- times a signal wasn't recorded (it left the selection); resumed is NULL while it still isn't
      CREATE TABLE pauses (
        signal_id TEXT NOT NULL,
        stopped INTEGER NOT NULL,
        resumed INTEGER,
        PRIMARY KEY (signal_id, stopped)
      ) WITHOUT ROWID;
    `
  }
]
