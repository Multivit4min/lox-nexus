---
name: port-integration
description: Port an integration from old/loxone-nexus into a Lox Nexus plugin under plugins/<name>, designed fresh against the public plugin SDK. Use when asked to port, migrate or rewrite one of the old integrations (homeassistant, calendar, fronius, mqtt, sonos, hue, webhook, script).
---

# Port an old integration to a plugin

Argument: the integration name, e.g. `fronius`. Work in `plugins/<name>`. Delegate implementation
to the `plugin-dev` agent if it isn't already the one running.

## 1. Understand the old behaviour (read-only)
- Read `old/loxone-nexus/src/integration/<name>/` completely, and the matching UI under
  `old/loxone-nexus-frontend/src/integrations/<name>/`.
- Write down, in your own words:
  - its config fields (mark secrets)
  - what it reads from the device (future **Sensors**)
  - what it sends to the device (future **Actuators**)
  - what the user browses to pick things (future **Catalog**)
  - what status it shows (future **Panel**)
- Check the known-bugs list for this integration in `docs/architecture.md`. Those bugs get fixed,
  not ported.

## 2. Design fresh
- One `Plugin<Config>` class, one class per Sensor or Actuator, a client class for the external API,
  and a `Catalog` builder. Each file stays under 200 lines.
- Decide each sensor's `Value` type and each actuator's `accepts` type and `concurrency`.
- Decide what goes in `this.store` (persisted) versus memory.
- Present the class list and a short rationale before writing code if the design is non-obvious.

## 3. Implement
- package.json: `loxNexus` manifest (apiVersion, entry, name, icon). The only workspace dependency
  is `@lox-nexus/plugin-sdk`.
- Config schema in its own file. Secret fields are marked secret.
- All timers, sockets and subscriptions go through `this.every()`, `this.listen()` and `this.own()`.

## 4. Test
- `PluginTestHost` tests for every sensor and actuator, with mocked external APIs (recorded JSON
  fixtures in `test/fixtures/`), and a stop/start cycle that leaves no active handles.

## 5. Finish
- `plugins/<name>/README.md`: what it does, config, sensors, actuators, known limitations.
- `npm run lint && npm run typecheck && npm test` pass.
- Ask the `reviewer` agent to review the change.
