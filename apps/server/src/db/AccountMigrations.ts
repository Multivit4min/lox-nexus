import type { Migration } from "./Migrator.ts"

/** Migrations 11 and on, for accounts: the users page, MCP's access tokens and their audit. Append only, like MIGRATIONS. */
export const ACCOUNT_MIGRATIONS: readonly Migration[] = [
  {
    version: 11,
    name: "user_last_login",
    // shown on the users page; NULL for accounts that never logged in (or did before this column)
    sql: "ALTER TABLE users ADD COLUMN last_login_at INTEGER"
  },
  {
    version: 12,
    name: "access_tokens",
    // personal access tokens for MCP (ADR 0020): only the SHA-256 is kept. They don't expire; a
    // deleted user takes theirs along, and any password change ends them: the trigger covers the
    // Change password dialog, Set password on the users page and the reset-password command alike
    sql: `
      CREATE TABLE access_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        scopes TEXT NOT NULL,
        token_sha256 TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER
      );
      CREATE INDEX access_tokens_user ON access_tokens (user_id);
      CREATE TRIGGER access_tokens_end_with_password AFTER UPDATE OF password_hash ON users
      WHEN NEW.password_hash IS NOT OLD.password_hash
      BEGIN
        DELETE FROM access_tokens WHERE user_id = NEW.id;
      END;
    `
  },
  {
    version: 13,
    name: "mcp_audit",
    // what agents changed or did, for "Recent activity" on the token page (ADR 0020). Inputs are
    // stored masked; a revoked token's entries keep its name, a deleted user's go with them
    sql: `
      CREATE TABLE mcp_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_id TEXT REFERENCES access_tokens(id) ON DELETE SET NULL,
        token_name TEXT NOT NULL,
        tool TEXT NOT NULL,
        input TEXT NOT NULL,
        outcome TEXT NOT NULL,
        detail TEXT
      );
      CREATE INDEX mcp_audit_user ON mcp_audit (user_id, id);
    `
  }
]
