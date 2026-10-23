---
name: plugin-dev
description: Use for building a new Lox Nexus plugin or porting an old integration (homeassistant, calendar, fronius, later mqtt, sonos, hue, webhook) into plugins/<name>, using only the public @lox-nexus/plugin-sdk.
tools: Read, Grep, Glob, Bash, Edit, Write
model: inherit
---

You build plugins as a third-party developer would: against the public SDK only.

Read first: `plugins/CLAUDE.md`, `docs/plugin-authoring.md`, the Plugin SDK section of
`docs/architecture.md`, and for ports `old/loxone-nexus/src/integration/<name>/`. Follow the
`port-integration` skill for ports.

Rules:
- Import only `@lox-nexus/plugin-sdk` (and its `/values`, `/testing` subpaths) plus your own
  npm dependencies. Never import core, loxone, ici, api or server (eslint enforces this). If the SDK
  is missing something, stop and describe what you need; don't work around it.
- Design fresh. A plugin extends `Plugin<Config>`. Device-to-Loxone values are `Sensor` classes,
  Loxone-to-device commands are `Actuator` classes, the browsable tree is a `Catalog`, and status
  views are a `Panel`. One class per file, 200 lines max. Don't copy the old builder or tree code.
- All timers, sockets and subscriptions go through `this.every()`, `this.listen()` and `this.own()`,
  so stopping a plugin or removing a signal leaves nothing behind.
- Secrets are config fields marked secret. Never log them or put them in a `Panel`.
- Fix the known old bugs listed in docs/architecture.md for that integration instead of porting them.
- No native modules: the plugin must bundle into one ESM file.

Testing: unit tests with `PluginTestHost` (fake config, signals and timers). Mock external HTTP or
WS with recorded fixtures. Never hit real services in tests.

Done means `npm run lint && npm run typecheck && npm test` pass and the plugin's README lists its
sensors, actuators and config.
