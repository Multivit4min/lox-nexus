# How Nexus sees a plugin

Read this first if you have never seen a Nexus plugin: it shows what runs where and which files a plugin has.

Nexus never imports your code into its own process. It starts a **worker thread** for each
configured instance of a plugin and talks to it with messages. Three consequences follow:

- A plugin that crashes, hangs or leaks takes nothing else down. Nexus restarts it.
- Everything the plugin knows about Nexus arrives through the SDK objects (`this.config`,
  `this.store`, the `params` of a sensor). You never see the bus, the database or other plugins.
- Values you send and receive are plain data (see [Values](../values.md)) that survives being copied
  between threads.

Your plugin offers two kinds of **signals**, which are named values on Nexus' internal bus:

| Kind | Direction | Is for | You write |
|---|---|---|---|
| **Sensor** | device to Nexus | a reading, a state, an event | a class that calls `emit(value)` |
| **Actuator** | Nexus to device | a command, a setting, a switch | a class whose `run(value)` talks to the device |

The user then connects signals with **wires** (for example a sensor of yours to a Miniserver
input). Wires, topics and the Bus Inspector are the user's business; you only decide what exists
and what it does.

The user adds an **instance** of your plugin (with its settings) and then adds **signals** to the
instance, either by hand or by picking them from your [catalog](catalog.md). One
plugin can have many instances, for example one per inverter, and each runs separately.

## Shape of a plugin

```
my-plugin/
  package.json        "loxNexus": { "apiVersion": 1, "id": "myplugin", "entry": "dist/plugin.js", "name": "…", "icon": "…" }
  src/
    index.ts          export default PluginEntry.define(MyPlugin)
    MyPlugin.ts       class MyPlugin extends Plugin<MyConfig>
    MyConfig.ts       zod schema; secret fields wrapped in secret()
    sensors/*.ts      one Sensor class per kind of value (device to Loxone)
    actuators/*.ts    one Actuator class per kind of command (Loxone to device)
    MyCatalog.ts      optional browsable tree of ready-to-add sensors and actuators
    *.test.ts         PluginTestHost tests, next to the code they test
  test/fixtures/      recorded (or documented) API responses the tests serve
```

The manifest is explained in [Publishing a plugin](../publishing.md#the-manifest). `id` is the
plugin's topic segment and stable reference: `myplugin/<instance>/sensor/<signal>`.

Keep files short and give each class one job. The first-party plugins are a good model.
`PluginEntry.define(MyPlugin)` in `src/index.ts` is the only line that connects your class to the
runtime. Loaded by Nexus it starts the runtime; imported anywhere else (tests, tools) it just
returns the class.
