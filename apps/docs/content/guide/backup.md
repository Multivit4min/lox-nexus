# Backup

The **Backup** page saves the whole installation as one file and restores it. Make one before an
update, and keep it somewhere else than the server.

## What is in a backup

Everything Nexus keeps in its data directory:

- Miniservers, their signals, wires, forces and the last values
- plugin instances with their settings, signals and stored state, and the **installed plugins'
  files**, so a restore needs no reinstalling
- users, settings, what the history records and what plugins watch
- the **value history**, if you tick it (it can be large; without it the backup stays small)

Not in it: the plugin repository folder (plugins offered for installing) and the development
plugins of a source checkout.

## Passphrase

The backup holds secrets: Miniserver passwords, plugin tokens, password hashes. So the **whole file
is encrypted** with a passphrase you choose (at least 8 characters; AES-256-GCM, the key derived
with scrypt; choose a long one, since a copied file can be attacked offline). Without the passphrase the backup can't be restored, and nobody can read it. Any
change to the file is detected when it is restored.

## Making a backup

Enter the passphrase twice, tick *Include the value history* if you want it, and press **Download
backup**. Nexus copies its databases while it keeps running and your browser saves the file
(`lox-nexus-backup-<date>.nxbackup`) as it is prepared.

## Restoring

1. Choose the file, enter its passphrase and press **Check backup**. Nexus uploads and checks the
   whole file: the passphrase, that nothing was changed, and that it was made by this or an older
   version of Nexus. Nothing changes yet.
2. Press **Restore and restart**. Nexus restarts with the backup's state; users and passwords
   become those of the backup. The files it replaced are kept in `before-restore-<time>` in the
   data directory, so a restore can be undone by hand (delete those folders once you no longer
   need them: they hold the old secrets and history). *Discard* drops the checked backup instead.
   A checked backup is never applied by an ordinary restart; only this button does that.

A backup without value history leaves the current history in place; history of signals the
restored configuration doesn't have is removed an hour later. A backup made by an older Nexus is
brought up to date when Nexus starts.

## The configuration file

**Export** on the Miniservers page saves the configuration as a JSON file: Miniservers, their
signals, wires, which signals the history records, and the plugin instances with their sensors,
actuators and watched signals. It is for moving a setup or keeping it in git, not a full backup:

- Miniserver passwords are never in it. An import keeps the password stored for a Miniserver with
  the same id.
- The plugins' secret settings (tokens, passwords) are in it only when you tick **Include the
  plugins' secret settings**, encrypted with a passphrase of at least 12 characters. The import
  asks for it. Without them, an instance with the same id keeps the secrets it has; a new one
  starts without them and the import names what to enter in its settings.
- Plugin storage (the Matter bridge's devices and pairings, tokens a plugin received) is not in
  it. An import keeps the storage of an instance with the same id; elsewhere, pair again, or use
  a backup to move everything.

**Import** replaces the whole configuration, the plugin instances too when the file has them; they
stop first and start again on the file's settings. A file from before plugin instances leaves them
as they are, and its wires to their sensors and actuators are kept. Forces and last values stay on
topics that still exist. If anything fails, the configuration from before is restored, also after
a crash in the middle.

