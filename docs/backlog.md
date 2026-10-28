# Backlog

Work that is parked on purpose. Each item says what's needed to pick it up.

## ICI protocol research (needs the test Miniserver)

Details and current findings: `packages/ici/PROTOCOL.md`. Captures go to
`packages/ici/test/fixtures/`.

- **RGBW flags (bytes 6–7).** `0x4000` appears on Lighting Controller sequence steps (mood 69).
  It is set on every sequence step, with the step time as fade, and never on static moods
  (checked 2026-10-28). Left: send a step with and without `0x4000` to a real RGBW smart actuator
  and compare (needs one wired to the test Miniserver).
- **0x8D status packet.** Bytes 4–7 are the serial number (confirmed). Find out what byte 28
  (`0x64`) means: it has been the same in every capture since 2026-10-23, across several program
  changes. A firmware update or another Miniserver would show whether it is a version or model.
- **0x9F encryption: parked by decision.** Receiving works end to end and is confirmed for analog
  (`PROTOCOL.md`). The IV fields are masked with a password-derived value, so the magic and kind
  bytes in `IvBlock` and `PROTOCOL.md` are one password's values, not constants (decrypting is
  unaffected). Modelling that mask and sending encrypted packets were stopped on purpose on
  2026-10-23; the owner decides whether and how to continue. Claude doesn't pick this up on its
  own.
- **TunableWhite bytes 6–7.** The Miniserver always sends `0x0800`; we send `0x0000`. Send both to a
  real tunable white actuator and compare (needs one wired to the test Miniserver).

## Core

- **Narrow interfaces everywhere.** `Recorder` and `ActiveWire`/`WireEngine` take `Pick<EventBus, ...>`.
  Do the same for services added since.

## Server

- **Domain errors.** Rule violations are recognised as plain `Error`s. A `DomainError` class (or
  error codes) in core and loxone would make the 409 mapping explicit, and allow machine-readable
  codes instead of messages with UUIDs.
- **One transform schema.** `WireBodySchema` lives in the server because the transform schemas live
  in core; the browser uses `TransformDto` in `packages/api`, a mirror kept in step by a test that
  fails to compile when they differ. Moving the schemas to a dependency-free module would leave
  one source.
- **`Miniserver.ts` is near the size limit** (about 170 of 200 counted lines). Split signal
  management into its own class with the next feature there.

## Config export and import

- **Plugins are left out.** The export has no plugin instances and no wires to plugin signals, and
  an import removes Loxone↔plugin wires. Export plugin instances (without secrets), their signals
  and those wires, so a backup is complete.

## Plugin SDK

- **Shared params with `.refine()`.** zod can't infer fields through a generic
  `z.object({...shared, ...extra}).refine(...)`, so Calendar's `FilterParams` needs a cast.
  Refinements also don't reach the JSON Schema (known limit of the supported subset).

## Plugin installer and UI (M5e leftovers)

- **Not built from the UI design:** a "roll back" button on the install result step (the card has
  one), plugin icons on the cards, and the names of the instances that block an uninstall
  (`InstalledPluginDto` only has a count).
- **Left out on purpose** (see `architecture.md`, "Left out on purpose"): ZIPs from URLs, private
  repositories with tokens, update checks, commit SHAs as refs, signatures.

## Statistics (history and exports)

- **Watching instances' choices aren't exported.** The config export carries only the history's
  selection; add the others once plugin instances are part of the export.
- **Chart live tail.** The history panel loads on open and on refresh; appending values from the
  live stream would keep a 1-hour chart current.
- **More exporters** on the same watching capability: MQTT, Prometheus, CSV.

## First-party plugins

- **MQTT, Sonos, Hue.** The previous Nexus had them; behaviour, settings and bugs not to repeat are
  in `legacy-nexus.md`. Build them with the plugin-dev agent.
- **Home Assistant: live actuator test.** Service calls are only tested against the simulated
  server; run them against the real instance once the user names entities that may be switched.
- **Home Assistant: events.** No `subscribe_events` (e.g. `zha_event` buttons), `input_datetime`,
  calendar or todo services yet.
