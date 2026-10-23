# 0006: Our own ICI implementation in packages/ici

## Context
The `loxone-ici` package has crash-level bugs (unvalidated datagrams, unhandled socket errors, a
wrong length field), leaky timers, and incomplete payload knowledge (T5, SmartActuator RGBW bytes
6–7). See `docs/loxone-ici-review.md`.

## Decision
Write a new class-oriented, dependency-free implementation in `packages/ici`, with a protocol lab
CLI (`ici-lab`: capture, annotate, diff, record, replay, send) to finish reverse-engineering the
unknown fields against a real Miniserver. Unconfirmed fields are preserved byte-exact and marked
experimental.

## Consequences
- We control robustness and typing, and every review item becomes a regression test.
- Protocol knowledge has to be earned through captures, so M1 needs hands-on sessions with a
  Miniserver.
- The package is standalone, so it can later be published as the successor of `loxone-ici`.
