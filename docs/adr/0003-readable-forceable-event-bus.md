# 0003: A readable, forceable event bus is the backbone

## Context
The old project had no way to see *why* a value changed, wrote the DB on every change, and
"forced" values existed only for Loxone variables.

## Decision
Every value change, command, command result and force is a message on one `EventBus`, with
readable slug-based topics (`loxone/haus/in/licht-kueche`) and causation (`id`, `causedBy`,
`traceId`). Delivery is ordered (one FIFO, never re-entered). State messages are deduped with
structural equality; commands never are. A `ForceRegistry` can pin any topic to a value: subscribers
see the forced value, real publishes are recorded as "shadowed", and forces persist until released
or expired. A `Recorder` keeps the latest 10k messages for the Bus Inspector and trace trees.
Retained state is snapshotted every few seconds instead of per change.

## Consequences
- Debugging comes down to reading the inspector, and forcing replaces ad-hoc "test values".
- All features have to go through the bus. No side channels between components.
- Feedback loops through external systems can't be traced, so dedup, throttling and `LoopGuard`
  mitigate them.
