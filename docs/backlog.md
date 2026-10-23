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
- **0x9F encryption.** Capture with a known password to confirm the decrypted layout and whether
  offset 11 holds the data type. `IciCipher` currently assumes it does.
- **SingleChannel bytes 0–2, TunableWhite bytes 6–7, TunableWhite fade unit.** Capture
  `lcout`-style outputs of those types.

## Core (from the M2 review)

- **Two-phase snapshot persistence.** `takeSnapshot()` clears the dirty set before the database
  write has succeeded. A failed write loses those changes until the value changes again. Add a
  take/commit pair when the snapshot store is built in M3.
- **Narrow interfaces everywhere.** `Recorder` and `ActiveWire`/`WireEngine` take `Pick<EventBus, ...>`.
  Do the same for services added in M3+.
- **`node:crypto` in core.** `CausalChain` uses `randomUUID` for its boot id. It's harmless, but
  the boot id could be injected to keep core strictly IO-free.
