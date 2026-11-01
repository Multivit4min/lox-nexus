# Writing plugins

A plugin connects one kind of device or service to Nexus: a smart plug, an inverter, a calendar.
You write it in TypeScript, against one package, `@lox-nexus/plugin-sdk`. Nexus runs each
configured copy of your plugin in its own worker thread and talks to it only through messages, so
a plugin that crashes, hangs or leaks takes nothing else down.

If you have never written one, start with the [tutorial](tutorial/index.md). It builds a complete
plugin in about an hour, and you see something work after every step.

> **Not available yet:** the SDK isn't published to npm, and there is no plugin template
> repository. Until then you develop a plugin inside a checkout of Nexus, in `plugins/<name>/`,
> and move it out when it is done. A built plugin installs from a ZIP file or a git repository,
> see [Publishing a plugin](publishing.md).

## What a plugin does, in a picture

```
  device               Nexus                                     Loxone
+----------+    +-------------------------+              +-----------------+
|          |    |                         |              |                 |
|          |--->| sensor "Power"          |--- wire ---> | Miniserver      |
|  smart   |    |   (a signal)            |              |   out signal    |
|  plug    |    |                         |              |                 |
|          |<---| actuator "Switch"       |<-- wire ---- | Miniserver      |
|          |    |   (a signal)            |              |   in signal     |
|          |    |                         |              |                 |
+----------+    +-------------------------+              +-----------------+
                 plugin instance "Desk lamp"
```

You write the middle part: how to read the device (a **sensor**) and how to command it (an
**actuator**). The user adds an **instance** of your plugin for each device, fills in its
**settings**, adds the sensors and actuators they want, and connects them to a Miniserver with
**wires**. You never see wires, the bus or other plugins; you only decide what exists and what it
does.

## The words

| Word | What it is |
|---|---|
| **Plugin** | Your package: a class that extends `Plugin`, plus sensor and actuator classes. |
| **Instance** | The plugin configured once, for example for one plug. One plugin can have many instances, and each runs separately. |
| **Settings** | What the user fills in when adding an instance (an address, a token). You describe them as a zod schema, Nexus builds the form. In code they are called `config`. |
| **Signal** | A named value on Nexus' bus, with a topic such as `smart-plug/desk-lamp/sensor/power`. A sensor or actuator the user has added is a signal. |
| **Sensor** | A class that turns what the device reports into values (device to Nexus). It becomes the source of wires. |
| **Actuator** | A class that carries out a command (Nexus to device). It becomes the target of wires. |
| **Params** | The settings of one signal, for example *which reading* a meter sensor follows. You describe them per sensor or actuator. |
| **Catalog** | An optional tree of ready-to-add sensors and actuators, so the user picks from what the device has instead of typing ids. |
| **Panel** | An optional status view on the instance's page: facts, tiles, a table. It is data, not UI code. |
| **Action** | An optional button on the instance's page that opens a small form, for things like pairing a device. |
| **Wire** | A connection from one signal to another, made by the user. See [Wires](../guide/wires.md). |

## What to read when

| You want to | Read |
|---|---|
| Write your first plugin | The [tutorial](tutorial/index.md) |
| See a whole plugin in one piece | [The whole plugin on one page](tutorial/whole-plugin.md) |
| Know what runs when, and where code belongs | [Lifecycle](guide/lifecycle.md) |
| Add a setting, a Test connection button, or a Find button | [Settings](guide/settings.md) |
| Report that the device is unreachable | [Starting, failing and degrading](guide/failing.md) |
| Receive pushes from another system | [Webhooks](guide/webhooks.md) |
| Show facts or buttons on the instance page | [Panel and actions](guide/panel.md) |
| Receive the values of other signals (an exporter) | [Watching signals](guide/watching.md) |
| Test a plugin | [Testing](testing.md) |
| Hand a plugin to other people | [Publishing](publishing.md) |
| Look up a signature, a default or a limit | [SDK at a glance](sdk-at-a-glance.md) and the [reference](../reference/sdk/index.md) |
| Everything else | The [plugin guide](authoring.md), one page per topic |

For real code, the first-party plugins are good models: the [Fronius plugin](fronius.md) is
read-only and polls; the [Home Assistant plugin](homeassistant.md) keeps a connection open and has
actuators.
