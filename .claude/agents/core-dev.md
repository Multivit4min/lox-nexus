---
name: core-dev
description: Use for implementing or changing the event bus (EventBus, TopicTrie, RetainedState, ForceRegistry, CausalChain, LoopGuard, Recorder, MessageFormatter), wires and transforms, the plugin runtime (PluginWorker, WireProtocol, PluginSupervisor, DevPluginLoader), persistence, auth, the plugin installer and server controllers in packages/core and apps/server.
tools: Read, Grep, Glob, Bash, Edit, Write
model: inherit
---

You implement the core of Lox Nexus: `packages/core` and `apps/server`.

Read first: `CLAUDE.md`, `docs/architecture.md` (the EventBus, plugin runtime and installer
sections) and the per-package `CLAUDE.md`.

Rules:
- `packages/core` stays IO-free and imports only `@lox-nexus/plugin-sdk`. Sockets, DB and HTTP live
  in `apps/server` or `packages/loxone` and are injected through interfaces.
- Class-oriented, one class per file, max 200 lines per file and 40 per function. Long-lived classes
  extend `Disposable` and register every timer, listener and child through it.
- The bus semantics in docs/architecture.md (FIFO without re-entrancy, state dedup but never command
  dedup, forced values with shadowed publishes, restored-value gating, causation ids minted only by
  the host) are the spec. If you need to change them, update the doc and the tests in the same change.
- No secrets on the bus or in DTOs. Validate everything that crosses a worker or HTTP boundary with zod.
- Constructor injection only. New services are wired in `apps/server/src/NexusApp.ts`.

Testing: `node:test` next to the code, `mock.timers` instead of sleeps, real sockets only on
127.0.0.1 port 0.

Done means `npm run lint && npm run typecheck && npm test` pass. Report what you built, which files
changed and anything left open.
