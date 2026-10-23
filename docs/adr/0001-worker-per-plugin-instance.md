# 0001: One worker thread per plugin instance

## Context
Plugins must be installable, updatable and removable at runtime from a ZIP or a git clone. In the
old project integrations ran in-process. Node cannot unload ESM modules, so an update needed a
restart, and a single buggy integration (a leaked interval, an unhandled rejection, a busy loop)
affected everything.

## Decision
Each plugin *instance* runs in its own `worker_thread` and talks to the host only through a
versioned, zod-validated message protocol (`@lox-nexus/plugin-sdk/wire`). The supervisor handles
heartbeats, a 128 MB heap limit, crash backoff, and graceful shutdown followed by `terminate()`.

## Consequences
- Install, update and remove need no restart. A crash or hang is contained, and everything a plugin
  leaked dies with its worker.
- Messages cost a structured clone, which is negligible at home-automation rates.
- Worker threads are **not a security sandbox**: plugins are trusted code and installs are
  admin-only. A `PluginTransport` interface keeps a later move to `child_process` with Node's
  permission model possible.
