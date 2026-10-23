# Writing a Lox Nexus plugin

> Stub. The SDK is implemented in M4, and this guide grows with it. The target design is in
> `architecture.md` (Plugin SDK section).

## Shape of a plugin

```
my-plugin/
  package.json        "loxNexus": { "apiVersion": 1, "entry": "dist/plugin.js", "name": "…", "icon": "…" }
  src/
    MyPlugin.ts       export default class MyPlugin extends Plugin<MyConfig>
    config.ts         zod schema; secret fields marked secret
    sensors/*.ts      one Sensor class per readable value type (device → Loxone)
    actuators/*.ts    one Actuator class per command (Loxone → device)
    MyCatalog.ts      optional browsable tree of ready-to-add sensors and actuators
  test/               PluginTestHost tests + recorded API fixtures
```

## Rules
- Depend only on `@lox-nexus/plugin-sdk` and your own npm packages. No native modules.
- Register every timer, listener and connection through `every()`, `after()`, `listen()` and
  `own()`, so stop and remove leave nothing behind.
- Ship one prebuilt ESM bundle (esbuild, `platform: node`) at `entry`.
- Never log secrets, or put them in a `Panel`.

## Installing
Admins install plugins from a ZIP upload or a git URL plus ref (the ref must contain the built
bundle). Plugins are trusted code: they run in a worker thread but are not sandboxed.
