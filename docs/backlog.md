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
- **0x9F encryption.** Receiving is implemented from a third-party reverse engineering
  (`PROTOCOL.md`), not yet confirmed by our own capture. The test Miniserver has an encrypted remote
  system (`encrypte`, UDP 61264), but nothing has arrived yet; the dev container probably doesn't
  receive port 61264. Once packets arrive: capture with `ici-lab capture --port 61264 --password …`,
  confirm the layout, then build sending (handshake answers, heartbeat, priming, source port 61263).
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
- **Editing a Loxone signal.** There is no PUT for signals yet. Changing a label, slug or data type
  means deleting and re-adding it, which deletes its wires.
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

