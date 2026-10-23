# 0005: Loxone is part of the core, not a plugin

## Context
Nexus exists to connect things to Loxone. Every other integration is optional.

## Decision
Miniservers, Loxone signals and discovery live in `packages/loxone`, run in-process, have their own
tables and UI, and plug into the bus through the same signal interfaces the plugin supervisor uses.
The wire engine never special-cases Loxone.

## Consequences
- The primary use case works without any plugin installed and has no worker overhead.
- Loxone code is held to the same boundary rules: `packages/loxone` depends on `core` and `ici`
  only.
