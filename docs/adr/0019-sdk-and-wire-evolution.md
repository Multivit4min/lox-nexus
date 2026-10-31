# 0019: The plugin SDK and the wire protocol evolve without breaking installed plugins

Status: **Accepted** (2026-10-30). The policy, the API report and the accepted version sets apply
now; semver and the changelog start with the SDK publish pipeline (M6); the N−1 adapter and the
UI warning are built with the first wire version bump.

## Context

Each plugin bundle carries its own copy of the SDK runtime (ADR 0002). A change to the SDK's
TypeScript API reaches an author only when they rebuild. What breaks an *installed* plugin is the
contract between its bundle and the host:
- the **wire protocol** (`plugin-sdk/src/wire/`, `WIRE_VERSION` 1): the messages, the shapes
  they carry (description, catalog, panel, HTTP), the `hello` and the `workerData.loxNexus` key.
  The host checked `hello.version` for an exact match on every start, and also when it describes
  a package at install and when it checks settings (`PluginSession.greet`).
- the **manifest** (`loxNexus` in package.json): `apiVersion` had to be the literal 1. It is read
  at install and by the development loader, never at boot (installed versions come from the
  database).

Additions already work in both directions within version 1. The worker's `hello` lists
`features` ("log.level", "config.check") and the host sends their messages only to workers that
listed them. Other additions are gated by the description (`watches`, declared `actions`) or by
the request (`config.migrated` only after an init with `configVersion`). The host skips worker
message types it doesn't know. zod strips unknown fields on both sides. The SDK runtime logs and
ignores host messages it can't parse. `WireContract.test.ts` keeps frozen version-1 samples
parsing. What is missing is a rule for the change that can't be additive, and a meaning for
`apiVersion` beside `WIRE_VERSION`.

The SDK isn't on npm yet and only first-party plugins exist, so fixing the rules now is cheap.

Considered:
- **Exact match forever, every plugin rebuilt on a bump.** This is simple for us, but every
  third-party plugin stops on the day a user updates Nexus.
- **Negotiation in both directions** (a newer SDK speaks an older protocol to an older host).
  Each bundle would carry every old protocol. Users update Nexus more often than plugins, so the
  host side is the one that has to bridge.
- **`apiVersion` = the SDK major the plugin was built with.** SDK majors break source code (a
  renamed method, a zod major, ADR 0011) far more often than they break bundles. The host would
  refuse bundles it can run, or need a release for every SDK major.
- **`apiVersion` = the wire version, declared in the manifest.** The author writes the manifest
  by hand, but the wire version comes from the SDK compiled into the bundle, so the two drift.
  The install already runs `describe`, which starts with `hello`, so the true value is known
  before the user confirms.

## Decision

- **Additive by default.** A protocol change adds optional fields or new message types.
  - New host-to-worker messages are gated by a `hello` feature, a description declaration or
    the request that asks for them. An older SDK logs an unknown request and never answers it,
    so the host would only see a timeout.
  - Widening a value set that the other side parses (a new `Value` type, log level, status or
    union member) is not additive: the older parser rejects the whole message. It needs a gate
    like a new message.
  - An existing field or message never changes meaning. Removing or redefining one needs a new
    wire version. The `hello` shape and `workerData.loxNexus` are frozen across all versions,
    since versions are negotiated through them.
- **The host accepts a range of wire versions:** the current one N and the one before it, N−1.
  - The checks are set membership from now on: `WireVersions` in core (one member until the
    first bump) and `PLUGIN_API_VERSIONS` for the manifest. A refusal says whether Nexus or the
    plugin needs the update. `hello` has its own frozen schema (`HelloSchema` in `./wire`).
  - A per-version adapter in `packages/core/src/plugins/` sits between `PluginWorker` and
    `PluginSession`. After `hello` it validates N−1 messages with a frozen copy of that version's
    schemas and translates them in both directions, so the session, supervisor and everything
    above see only version N.
  - N−1 stays accepted in the Nexus release that introduces N and in at least the next release.
    The release that drops it is named when N ships.
  - Nothing older than N−1 is kept. A plugin built for a newer version than the host knows is
    refused, as today.
- **`apiVersion` versions the manifest format and nothing else.** It covers the `loxNexus` block
  that Nexus reads before running any code. `WIRE_VERSION` versions the protocol and is checked
  through `hello`, at install, at a settings check and at every start. The SDK's semver major
  is a third number that the host never sees.
  - The host accepts a set of `apiVersion` values. `ManifestValidator` already maps every
    accepted one to the version-free `InstallManifest`.
  - A new optional manifest field (as `heapMb` was) is additive and keeps `apiVersion`.
  - Dropping an old `apiVersion` only stops new installs of old packages; installed versions are
    never re-validated.
  - The field keeps its name: every plugin and guide already uses it.
  - This replaces ADR 0011's "apiVersion bump if the description format changes". The
    description travels over the wire, so such a change is a wire version change.
- **Warn before breaking.**
  - The installer records the wire version from `hello` with each installed version's
    description. A bump of `PluginVersions.FORMAT` describes existing rows again to fill it in.
  - The plugins page, the instance page and the install review show when a plugin uses a
    deprecated wire version, and the release in which it stops working.
  - A start on a deprecated version logs one warning. Nothing is blocked before that release.
- **SDK deprecations.**
  - A symbol that will go gets `@deprecated` JSDoc that names its replacement. It stays at least
    until the next major: deprecated in 2.x, removed in 3.0 at the earliest, and only after a 2.x
    release shipped the deprecation.
  - Where it is cheap, the runtime logs one warning per worker when a deprecated path runs. The
    plugin template enables typescript-eslint's `no-deprecated`.
- **An API report guards the published surface.** API Extractor writes one report per export
  path (`.`, `./values`, `./wire`, `./testing`) to `packages/plugin-sdk/api/*.api.md`
  (`npm run api:report`). The reports are checked in, and CI runs `npm run api:check`, which
  fails when they differ, so every change to the public surface shows up as a diff in review. It
  complements `WireContract.test.ts`: the report covers types, and the contract test covers what
  bundles that are already built send and accept.
- **Semver and a changelog once published.**
  - `@lox-nexus/plugin-sdk` starts at 1.0.0 rather than 0.x, so third-party authors get semver
    guarantees from the first release.
  - Its changelog has migration notes for every major. Each entry names the wire version the SDK
    speaks and, for new features, the first Nexus release that supports them.
  - A wire version bump is always an SDK major. First-party plugins are migrated in the same
    change.

## Consequences

- Updating Nexus never stops a plugin without warning. A plugin has at least one release, with
  the deadline shown in the UI, to be rebuilt.
- A wire bump costs a frozen copy of the old schemas, an adapter and its tests. That cost is
  meant to make the additive path the easy one. Each supported version keeps its own frozen
  samples in the contract test.
- An older Nexus still can't run a plugin built for a newer wire version. A plugin that uses a
  newer feature on an older Nexus loses that feature without an error (no `watched()` calls, no
  settings check). The changelog says which release each feature needs. A minimum Nexus version
  in the manifest is left out until it is needed.
- At the first bump, `PluginWorker` parses `hello` with `HelloSchema` before it picks the message
  schemas; until then the version-1 union, which contains it, validates everything.
- The report is generated from declarations emitted into a temporary folder, because the SDK
  isn't built in the repository. Changes to the zod schemas in `./wire` make long diffs in the
  report; that is expected.
- `packages/plugin-sdk/CLAUDE.md` and the `apiVersion` row in the plugin publishing guide follow
  this ADR.
- Plugin settings migrations (`configVersion`, `migrateConfig`) are a separate path and are not
  covered here.

## Note (2026-10-31): host features

The gates above cover what the *host* adds. For what a *worker* sends that an older host would
refuse (a widened union, such as new panel parts or an action answer that is an object), the host
announces what it understands in `init` (`hostFeatures`, `HOST_FEATURES` in `./wire`), the mirror
of `hello.features`. The SDK runtime checks it and sends an older host what it understands (v1
panels, the message alone), so plugins never check features themselves. Worker messages a host
doesn't know (`panel.changed`, `action.progress`) are sent only to hosts that list them, although
hosts skip unknown types anyway.

Source compatibility is a separate matter: panel cells are now `string | { text?, tone?, until?,
since? }`, so plugin code and tests that read `keyValue` values or table rows as strings stop
compiling and use `cellText()` from `./testing`. That is acceptable before 1.0; after it, such a
widening of a type plugins read needs a major and a migration note.
