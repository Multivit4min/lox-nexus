# 0010: Installed plugin versions, precedence and hot update

## Context
Installed plugins need versions, rollback and updates without restarting Nexus (ADR 0001).
Development plugins (`NEXUS_DEV_PLUGINS_DIR`) can have the same id as an installed one. The
installer's describe step already runs plugin code, and an update can remove capabilities that
configured signals use.

## Decision
- **The database is the source of truth.**
  - `plugin_versions` holds the source, commit, sha256s and the description.
  - `plugin_packages` points at the active version and the previous one.
  - Files live in `data/plugins/<id>/<version>`; a directory without a row is an orphan and is
    deleted at boot.
- **Two versions per plugin:** the active one and the one before it. Rollback and roll-forward
  are "activate the other one".
- **Two phases.** *Stage* fetches, validates and describes, and returns the source, commit and
  impact. *Confirm* (with the active version the user saw) moves the package in and activates it.
  The trust warning comes before staging, because describing runs the code.
- **The development copy wins** over an installed one with the same id while the development
  loader provides it. The catalog keeps both layers and marks the installed one as shadowed.
- **Hot update** restarts running instances on the new package through their supervisor queue.
  Enabled instances in `error` or `crashed` start on it. Signals whose capability is gone stay
  stored and wired but marked orphaned. Config and store are not migrated. In-flight commands
  fail and are not replayed.
- **Uninstall is refused** while instances of the plugin exist.

## Consequences
- A crash at any step leaves a state the boot can reconcile without user action.
- Rollback restores orphaned signals and their wires, because nothing was deleted.
- Plugin authors must keep their store readable across one version in both directions. This goes
  into `plugin-authoring.md`.
- In development an install of a workspace plugin's id has no visible effect until the
  development copy is gone. Tests and the walkthrough use an id outside the workspace.
- Same id, same version, different bytes is refused, so a version always means one bundle.
