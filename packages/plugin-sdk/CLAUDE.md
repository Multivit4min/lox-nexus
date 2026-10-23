# packages/plugin-sdk

The **published** contract for plugins: `Plugin`, `Sensor`, `Actuator`, `Disposable`, plus the
subpaths `./values`, `./wire` and `./testing`. Must not import anything from the workspace.

Every change here can break plugins in other repositories, so:
- treat exports as public API, and bump `apiVersion` / the wire version on breaking changes
- keep `./wire` messages backwards compatible, and add contract tests for them
- keep it small; host-only logic belongs in `packages/core`
