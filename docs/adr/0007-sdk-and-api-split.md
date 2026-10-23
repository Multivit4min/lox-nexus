# 0007: Split the published plugin SDK from the private API contract

## Context
Plugins (possibly in other repos) and the web UI both need shared types. The plugin contract has to
change slowly and follow semver. The UI contract changes all the time.

## Decision
`@lox-nexus/plugin-sdk` (published) holds the plugin classes, `./values` (Value and Converter),
`./wire` (worker protocol) and `./testing` (PluginTestHost). `packages/api` (private) holds the
REST and WebSocket DTOs. Internal packages resolve to TypeScript source through the
`@lox-nexus/source` export condition.

## Consequences
- UI changes never force an SDK release.
- Values and converters are shared by core, plugins and UI from a single place.
