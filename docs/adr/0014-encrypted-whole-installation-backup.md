# 0014: Backups are one encrypted stream of the data directory, applied at the next start

## Context
The config export covers Miniservers, signals and wires only. A backup before an update has to
bring back everything: plugin instances and their stores, installed plugin files, users,
selections, forces, and optionally the value history. It holds secrets (Miniserver passwords,
plugin tokens, password hashes). The history can be gigabytes; Nexus often runs on a Raspberry Pi.

## Decision
- A backup is a stream: an archive of entries (a JSON header line with path and size, then the
  bytes) holding a manifest, consistent copies of nexus.db and optionally history.db (SQLite's
  online backup, so Nexus keeps running), and the installed plugins' files (hard-linked into the
  snapshot, so an uninstall during a download can't cut it short); gzipped; encrypted as a whole
  with AES-256-GCM under a key derived from a passphrase (scrypt, N = 2^17, 128 MiB: the file can
  be attacked offline). The header (magic, the scrypt cost as log2 N, salt, iv) is authenticated
  with the rest, and storing the cost lets later versions raise it without a new format. Nothing
  large is held in memory, in the server or the browser (the download is a plain form post).
- A restore has two steps. The upload is decrypted and unpacked into `restore-pending/` (at most
  the free disk space), checked (the tag at the end, the manifest, a schema version this Nexus can
  migrate) and marked `checked`; nothing happens to it on a restart. "Restore" marks it `apply`, and
  the next start swaps it in under the database lock, before anything opens the files: the
  replaced files move to `before-restore-<time>/`, recorded in the marker so a start cut off halfway
  finishes the job instead of starting over. Nexus restarts itself in-process for this (main.ts
  builds a new app, once at a time).
- Everything is in the UI; there is no command for it yet.

## Consequences
- One passphrase protects all secrets in the file; a lost passphrase makes the backup useless.
- A failed or wrong restore can be undone by hand from `before-restore-<time>/`.
- Restoring needs disk space for the staged copy next to the current files.
- A server that doesn't start can't be restored through the UI; restoring then means moving the
  files by hand (a command is a possible addition).
