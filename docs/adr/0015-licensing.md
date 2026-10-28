# 0015: The app is GPL-3.0-or-later; the SDK, the ICI library and the plugins are MIT

## Context
Lox Nexus is going to be published, and keeping it open source matters to the owner. It has two
kinds of code. The app (server, web UI, core, Loxone integration, API contract) is what users run.
The plugin SDK, the standalone ICI protocol library and the first-party plugins are what other
people build on: plugins live in their own repositories, the protocol library is useful to other
Loxone projects, and the first-party plugins double as examples to copy from. All dependencies are
permissive (MIT, ISC, BSD, Apache-2.0; MPL-2.0 only in a build tool), so they don't limit the choice.

## Decision
- The app is **GPL-3.0-or-later** (root `LICENSE`; `apps/*`, `packages/core`, `packages/loxone`,
  `packages/api`). Anyone who distributes Nexus, changed or not, passes the source on under the
  same terms.
- `packages/plugin-sdk`, `packages/ici` and `plugins/*` are **MIT**, each with its own `LICENSE`.
- Considered: AGPL-3.0 for the app, which would also cover a modified Nexus offered as a service
  to others without distributing it. Not chosen: Nexus runs at home, next to a Miniserver, and the
  GPL is the more familiar and less restrictive copyleft. Everything MIT or Apache-2.0 would allow
  closed forks of the app.

## Consequences
- A plugin of any license can be installed and distributed: it imports only the MIT SDK and runs
  in a worker that talks to the host over messages. This only holds while the boundary does, so
  nothing GPL may move into the SDK, and the eslint boundary rules keep the SDK free of workspace
  imports.
- MIT code may flow into the app, not the other way: code from `packages/core` or `apps/*` can't be
  copied into the SDK, the ICI library or a plugin without relicensing it.
- The Docker image ships the server's TypeScript sources, so distributing the image also hands out
  the source the GPL asks for.
