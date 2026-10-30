# packages/plugin-sdk

The **published** contract for plugins: `Plugin`, `Sensor`, `Actuator`, `Disposable`, plus the
subpaths `./values`, `./wire` and `./testing`. Must not import anything from the workspace.

Every change here can break plugins in other repositories, so:
- treat exports as public API; `npm run api:report` records it in `api/*.api.md`, and CI fails
  until a changed report is committed. JSDoc counts: documenting an export changes its report
- protocol changes are additive and gated (a `hello` feature, a description declaration, or the
  request that asks); breaking one bumps the wire version, `apiVersion` only versions the manifest
  format (ADR 0019)
- keep `./wire` messages backwards compatible, and add contract tests for them
- keep it small; host-only logic belongs in `packages/core`
