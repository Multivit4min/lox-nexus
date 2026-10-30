# Security policy

Lox Nexus controls devices in people's homes, so security reports are welcome and taken seriously.

## Reporting a vulnerability

Please **don't open a public issue**. Report it privately through GitHub instead: the repository's
**Security** tab → **Report a vulnerability**. Include what is affected, how to reproduce it, and
what an attacker could do with it.

You'll get an answer within a week. Once a fix is released, the advisory is published, crediting
you if you like.

## Supported versions

Lox Nexus is pre-1.0. Fixes go into the latest release (and the `edge` image built from `main`);
older versions don't get patches.

## What counts

In scope, for example:

- getting into the web UI or API without logging in, or as another user
- reading secrets (plugin passwords and tokens, Miniserver passwords) through the UI, API, logs,
  a config export without its passphrase, or a backup
- webhook calls accepted without the right token
- the plugin installer writing outside its folder, or installing something other than what was
  reviewed
- making Nexus send values to a Miniserver or plugin it wasn't configured to

Not vulnerabilities, because they are how Nexus is designed:

- **Plugins are trusted code.** Each plugin instance runs in its own worker thread for stability,
  but worker threads are not a sandbox: a plugin can read files and open connections like Nexus
  itself. Only install plugins you trust; the install dialog says so too.
- **Every logged-in user is an administrator.** There are no roles yet.
- **Loxone intercommunication is plain UDP without authentication.** Nexus tells Miniservers apart
  by the IDs in each packet, which anyone who sees the traffic can copy, so anyone who can send
  packets to Nexus's intercommunication ports can send values. Keep those ports inside your
  network.
- Running Nexus reachable from the internet without HTTPS (set `NEXUS_SECURE_COOKIES=true` behind
  an HTTPS reverse proxy).
