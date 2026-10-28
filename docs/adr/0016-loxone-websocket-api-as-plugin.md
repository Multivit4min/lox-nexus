# 0016: The Miniserver's WebSocket API as a first-party plugin; ICI stays the primary path

Status: **Proposed** (2026-10-28), parked in the backlog by the owner for now. Evaluation:
`docs/evaluations/loxone-connections.md`.

## Context

Every value Nexus exchanges with a Miniserver today goes through Network Intercommunication (ICI).
This has three costs:
- Each value needs an input or output on the Nexus peer in Loxone Config.
- Everything counts against the 35 msg/s limit.
- Nexus can't see controls that nobody wired.

The Miniserver's WebSocket API, the one the Loxone app uses, offers every visualised control: the
structure file (`LoxAPP3.json`) has rooms, categories and state UUIDs, state changes are pushed, and
commands are accepted, all with a user login and tokens. Loxone documents it for third-party
clients.

ADR 0005 put Loxone in the core so the primary use case (ICI) needs no plugin. The WebSocket API
behaves like an integration: optional, a browsable catalog, sensors and actuators, credentials, and
a connection that drops and reconnects. The plugin runtime already has all of that: catalog,
panel, secrets, status, restarts with backoff, worker isolation and `PluginTestHost`.

## Decision

- Build a first-party plugin, `plugins/loxone-controls` (MIT, SDK only, no runtime dependency), on
  the WebSocket API. Sensors are control states, with params `{ control: uuidAction, state }`, and
  actuators are commands. The catalog is room ▸ category ▸ control ▸ state.
- Build it in three steps: L1 reads states, L2 sends commands, L3 adds colours and moods. Secured
  controls, TLS, statistics and a Loxone-specific UI are left out until a later decision.
- The plugin logs in as a dedicated, non-admin Miniserver user. A refused password is never
  retried, because the Miniserver locks out the address, and that address is also Nexus' ICI peer.
  The token is reused from the plugin store.
- ICI in `packages/loxone` stays the primary path and is unchanged. It remains the only way to
  carry non-visualised values and typed Smart Actuator and T5 values into the program.
- The other paths:
  - **Virtual Output → Nexus:** documented with the existing webhook plugin, no new code.
  - **Virtual HTTP Input and statistics backfill:** deferred.
  - **Virtual UDP in and out, and HTTP-per-value Virtual Inputs:** not built. The WebSocket
    channel covers Virtual Inputs.

## Consequences

- Users get no per-value setup for visualised controls, room and category browsing, history and
  export of any control without ICI load, and control of lights, blinds and moods from wires.
- Wires, forces, history, watching and export work unchanged, because everything is an ordinary
  plugin signal.
- These signals live under plugin topics (`loxone-controls/<instance>/…`) and on the Plugins page,
  not on the Miniserver's page. The host is entered twice, once for ICI and once for the plugin.
  Linking them is a later UI design.
- Commands act like taps in the app: they pass the control's logic and the user's rights, and may
  switch a control to manual (for example blind automatics). The documentation has to say this.
- The plugin follows Loxone's documented API and its control types. Generic state sensors and a raw
  command actuator keep unknown or new control types usable without code changes.
- The plugin is about the size of the Home Assistant plugin. Tests use a fake Miniserver on
  loopback and a synthetic structure file. Live tests against the test Miniserver need the
  owner's OK, read-only first.
- If the plugin becomes part of the primary use case, it can move into `packages/loxone` under a
  new ADR. MIT code may flow into the GPL app (ADR 0015).
