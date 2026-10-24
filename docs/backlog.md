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
- **T5.** Wire a T5 to an ICI output. Press each button, then two at once, then hold one. Check the
  Float64 bitmask hypothesis (1/2/4/8/16).
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

## Core (from the M2 review)

- **Narrow interfaces everywhere.** `Recorder` and `ActiveWire`/`WireEngine` take `Pick<EventBus, ...>`.
  Do the same for services added in M3+.
- **Topics left behind.** A Miniserver slug change leaves forces and snapshot values on the old
  topics, and an adopted packet's `discovered/<packet>` value stays in the bus until restart.
  Both are harmless but visible in the inspector. A `RetainedState.forget(topic)` would clean them up.
- **`node:crypto` in core.** `CausalChain` uses `randomUUID` for its boot id. It's harmless, but
  the boot id could be injected to keep core strictly IO-free.

## Server (from the M3b review)

- **Broken rows are invisible.** A stored Miniserver or signal that can't be loaded (e.g. written
  by a newer version) is logged and skipped. It doesn't show up in the API and can't be deleted
  there. Wires in that state are listed as `active: false`. Do the same for Miniservers and
  signals.
- **Domain errors.** Rule violations are recognised as plain `Error`s. A `DomainError` class (or
  error codes) in core and loxone would make the 409 mapping explicit, and allow machine-readable
  codes instead of messages with UUIDs.
- **Wire input schema in `packages/api`.** `WireBodySchema` lives in the server because the
  transform schemas live in core. The wire editor (M5) needs them in the browser. Move the
  transform schemas to plugin-sdk, or to a dependency-free module.
- **`SignalDto` has no owner** (Miniserver or plugin instance), which a wire editor needs for
  grouping.
- **One process per data dir.** Nothing stops two servers from using the same database. Add an
  exclusive lock file.

## Signal editing and config transfer (from the review)

- **Imports don't block other changes.** Only a second import is refused. A wire or signal created
  through the API while an import runs is lost, or makes the import roll back. A lock (409/503 for
  changing `/api/*` requests during an import) would close this. The backup lives in memory, so a
  crash mid-import loses it; writing it to the data directory first would make recovery possible.
- **Imports drop runtime state.** Forces and last values on Loxone topics are gone after an
  import, also after a rollback. They could be carried over for topics that exist before and after.
- **Wires to plugin signals.** The export leaves out wires whose ends aren't in the file. Once
  plugins register signals, decide whether exports should include plugin instances and their
  signals.
- **Rolled-back edits keep inactive wires.** If storing an edited signal fails after the runtime
  change, the signal is put back, but wires the edit made inactive stay inactive until the next
  boot. Storing only fails when runtime and database disagree, so this is rare.
- **`Miniserver.ts` is near the size limit** (about 170 of 200 counted lines). Split signal
  management into its own class with the next feature there.

## Plugins (from the M4 review)

- **Forces on actuators after a restart.** A force on an actuator topic is delivered once, as a
  command. After the plugin crashes and restarts, the device may no longer match the force. Replay
  active forces on an instance's actuator topics once it is running again.
- **Message size limits.** Text in worker messages is capped, but `store.set` values, log data and
  responses are not. Plugins are trusted code (ADR 0001), so this is about mistakes, not attacks.
- **PluginTestHost uses real timers** for its waits. A plugin test that mocks `setTimeout` hangs
  instead of failing. Take a clock, or wait with `setImmediate` loops.
- **Config export and plugins.** The export leaves out plugin instances and wires to plugin
  signals; an import removes Loxone↔plugin wires. Export plugin instances (without secrets) and
  those wires, so a backup is complete.
- **`export { z }` from the SDK** ties the SDK's public API to zod's major version. Record that in an
  ADR before the SDK is published.
- **Test-support classes.** `FakePluginTransport.ts` holds two classes, and a few small error
  classes live next to the class that throws them. Fine for now; split if they grow.

