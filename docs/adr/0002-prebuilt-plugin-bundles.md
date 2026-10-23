# 0002: Plugins ship prebuilt, self-contained bundles

## Context
Installing from ZIP or git could run `npm ci` and a build step, but that executes install scripts,
needs network access and toolchains, and produces a `node_modules` tree per plugin.

## Decision
A plugin declares `"loxNexus": { apiVersion, entry, name, icon }` in its package.json. `entry`
points to a single ESM bundle (esbuild, `platform: node`) that includes the SDK runtime and all
dependencies, with no native modules. The installer never runs npm. Git installs must point at a
ref that contains the built bundle (for example a release tag produced by the plugin's CI).

## Consequences
- Installs are fast and deterministic, and leave no install scripts to audit.
- Plugin authors need a build step; the plugin template repo provides it.
- Plugins can't use native modules. That is acceptable for the integrations planned.
