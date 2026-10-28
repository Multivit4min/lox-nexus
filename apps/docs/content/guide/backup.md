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
