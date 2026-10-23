# 0008: node:sqlite and scrypt instead of drizzle/libsql and argon2

## Context
The plan named drizzle + libsql for the database, argon2 for passwords, and
fastify-type-provider-zod for request validation. While building M3b:
- core's `ForceStore` is synchronous on purpose. The bus processes a force in one synchronous step,
  so the store is written before memory changes. libsql's client is async only.
- argon2 and libsql are native modules. That was risk #6 in the plan (ARM builds, Docker).
- fastify-type-provider-zod 7 requires `@fastify/swagger` and `openapi-types` as peers. We don't need
  OpenAPI.
- drizzle 0.45 has no adapter for Node's built-in `node:sqlite`.

## Decision
- **Database:** Node 24's built-in `node:sqlite` (`DatabaseSync`). A small `Database` class adds
  cached prepared statements and nested transactions. `Migrator` holds numbered SQL migrations,
  tracked by `PRAGMA user_version`. One repository class per table group. No ORM.
- **Passwords:** `scrypt` from `node:crypto` (N=2^15, r=8, p=1, 16-byte salt). It is stored as
  `scrypt$N$r$p$salt$hash`, so the cost can be raised later.
- **Validation:** routes call the zod schemas from `@lox-nexus/api` directly. A `ZodError` becomes
  a 400 with the issues in `ErrorHandler`.

## Consequences
- The server has no native dependencies, so `npm ci` works on any platform Node 24 runs on.
- SQL is written by hand. With ~8 tables and simple queries this is short, and every query sits in
  a repository class.
- Writes are synchronous. A local SQLite write takes microseconds, and the value snapshot is
  batched every 5 s, so the event loop is not affected.
- If drizzle supports `node:sqlite` later, repositories can switch without changing callers.
