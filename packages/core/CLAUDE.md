# packages/core

The IO-free heart: EventBus, TopicTrie, RetainedState, ForceRegistry, CausalChain, LoopGuard,
Recorder, MessageFormatter, SignalRegistry, WireEngine and transforms, and PluginSupervisor/PluginWorker.

- Imports only `@lox-nexus/plugin-sdk`. Persistence, HTTP and Loxone are injected through interfaces.
- Bus semantics are specified in `docs/architecture.md`. Change the doc and the tests together.
- Everything must be testable with fakes and `mock.timers`; no real sockets here.
