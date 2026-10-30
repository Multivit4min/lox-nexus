# 0011: The plugin SDK re-exports zod, and its major version with it

## Context
Plugins declare their config, sensor params and actuator params as zod schemas. The SDK reads
them at run time (validation, `toJSONSchema` for the UI) and in its types (`z.infer`,
`z.ZodType`). Its helpers `secret()` and `code()` wrap zod schemas with `.meta()`. A schema built
with a different copy of zod than the SDK's mostly works at run time, but the types don't line up
and `instanceof` checks inside zod fail across copies. Plugin authors would also have to keep their
zod version in step with the SDK's by hand.

## Decision
`@lox-nexus/plugin-sdk` depends on zod (`^4`) and re-exports it: `import { z } from
"@lox-nexus/plugin-sdk"`. Plugins use that `z` and don't depend on zod themselves (the plugin
authoring docs say so). zod's major version is therefore part of the SDK's public API: a zod major
upgrade is a **breaking** SDK release, together with a plugin `apiVersion` bump if the description
format (the JSON Schema zod writes) changes.

## Consequences
- One zod per plugin bundle, always the one the SDK was built and tested with; `secret()`, `code()`
  and inference work without version juggling.
- The SDK can't move to zod 5 without a major release, and installed plugins built against zod 4
  keep running (each bundle carries its own copy), but must be rebuilt to use the new SDK.
- If zod is ever replaced, the SDK keeps `z` as its schema API only if the replacement is
  compatible; otherwise that is a new `apiVersion`.

Superseded in part by [ADR 0019](0019-sdk-and-wire-evolution.md): `apiVersion` versions only the
manifest format. A change to the description format travels over the wire, so it is a wire version
bump, and a zod major is an SDK major.
