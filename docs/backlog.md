# Backlog

Work that is parked on purpose. Each item says what's needed to pick it up.

## ICI protocol research (needs the test Miniserver)

Details and current findings: `packages/ici/PROTOCOL.md`. Captures go to
`packages/ici/test/fixtures/`.

- **RGBW flags (bytes 6–7).** `0x4000` appears on Lighting Controller sequence steps (mood 69).
  To confirm what it means:
  1. Capture a static mood with a long fade time (e.g. 5 s). Does the flag appear?
  2. Change the speed of the sequence. Do the flag and the fade value change?
  3. Send a step with and without `0x4000` to a real RGBW smart actuator and compare.
- **0x8D status packet.** Compare bytes 4–7 (`eb 23 a2 94`) with the Miniserver's MAC or serial
  number (hypothesis: `50:4F:94:A2:23:EB`). Find out what byte 28 (`0x64`) means.
- **0x9F encryption.** Receiving works end to end and is confirmed for analog (`PROTOCOL.md`).
  Our Miniserver's IV magic and kind differ from the third-party document, and bytes 12–15 are a
  masked 32-bit counter. Next:
  1. Wire a digital, a text and an RGBW output to `encrypte` and capture, to learn their kinds.
  2. Sending: find out which magic/kind the Miniserver accepts from us (probe, needs the user's OK),
     then handshake answers, heartbeat, priming and source port 61263 per the document.
- **SingleChannel bytes 0–2, TunableWhite bytes 6–7, TunableWhite fade unit.** Capture
  `lcout`-style outputs of those types.

## Core

- **Narrow interfaces everywhere.** `Recorder` and `ActiveWire`/`WireEngine` take `Pick<EventBus, ...>`.
  Do the same for services added since.

## Server

- **Broken rows are invisible.** A stored Miniserver or signal that can't be loaded (e.g. written
  by a newer version) is logged and skipped. It doesn't show up in the API and can't be deleted
  there. Wires in that state are listed as `active: false`. Do the same for Miniservers and
  signals.
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
- **Imports don't block other changes.** Only a second import is refused. A wire or signal created
  through the API while an import runs is lost, or makes the import roll back. A lock (409/503 for
  changing `/api/*` requests during an import) would close this. The backup lives in memory, so a
  crash mid-import loses it; writing it to the data directory first would make recovery possible.
- **Imports drop runtime state.** Forces and last values on Loxone topics are gone after an
  import, also after a rollback. They could be carried over for topics that exist before and after.
- **Rolled-back edits keep inactive wires.** If storing an edited signal fails after the runtime
  change, the signal is put back, but wires the edit made inactive stay inactive until the next
  boot. Storing only fails when runtime and database disagree, so this is rare.
- **Old v1 exports (M6).** Format and mapping: `legacy-nexus.md`. Open decisions: argon2 hashes
  (verify them, or ask for new passwords) and per-hook webhook tokens (the webhook plugin has one
  token per instance).

## Plugin SDK

- **Testing host.**
  - An injectable clock: `mock.timers.tick()` moves `Date` to the end of the tick before the due
    timers run, so timers set from callbacks see the wrong time; Calendar steps minute by minute.
    Needs a `now()` in the plugin context that plugins use instead of `Date`.
  - Real unhandled rejections don't reach `Plugin.unhandledRejection` under node:test; the script
    plugin swaps node:test's listener to forward them. An option to forward them would remove that.
- **Shared params with `.refine()`.** zod can't infer fields through a generic
  `z.object({...shared, ...extra}).refine(...)`, so Calendar's `FilterParams` needs a cast.
  Refinements also don't reach the JSON Schema (known limit of the supported subset).
- **Wire reference.** The generated TypeDoc page cuts the message unions (`HostMessage`,
  `WorkerMessage`) short; list their members on the SDK-at-a-glance page or configure TypeDoc.

## Plugin installer and UI (M5e leftovers)

- **Not built from the UI design:** a "roll back" button on the install result step (the card has
  one), plugin icons on the cards, and the names of the instances that block an uninstall
  (`InstalledPluginDto` only has a count).
- **Left out on purpose** (see `architecture.md`, "Left out on purpose"): ZIPs from URLs, private
  repositories with tokens, update checks, commit SHAs as refs, signatures.

## Statistics (history and exports)

- **Unrecorded periods are drawn as the held value.** A signal switched off and on again shows its
  last value across the time it wasn't recorded; only the times Nexus wasn't running are gaps. A
  "no value" sample when recording stops (or tracking selection changes) would show it.
- **Watching instances' choices aren't exported.** The config export carries only the history's
  selection; add the others once plugin instances are part of the export.
- **Chart live tail.** The history panel loads on open and on refresh; appending values from the
  live stream would keep a 1-hour chart current.
- **InfluxDB partial writes** (1.x and 3 accept the valid lines of a batch) count the whole batch as
  rejected.
- **More exporters** on the same watching capability: MQTT, Prometheus, CSV.

## First-party plugins

- **MQTT, Sonos, Hue.** The previous Nexus had them; behaviour, settings and bugs not to repeat are
  in `legacy-nexus.md`. Build them with the plugin-dev agent.
- **Home Assistant: live actuator test.** Service calls are only tested against the simulated
  server; run them against the real instance once the user names entities that may be switched.
- **Home Assistant: events.** No `subscribe_events` (e.g. `zha_event` buttons), `input_datetime`,
  calendar or todo services yet.
