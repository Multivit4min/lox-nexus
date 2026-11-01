# 6. Tests, build and install

In this last step you write tests that run your plugin against the fake plug, build it into a
single file, and install it from a ZIP file the way another person would. You see green tests, and
your plugin on the **Installed** tab.

## Tests

A plugin that talks to a device breaks when the device changes or when you change the plugin, and
you only notice when the lamp doesn't switch. Tests catch that in seconds. The SDK runs your plugin
in-process through the same runtime that runs it in a worker, so you test the real code paths
without a Nexus server and without a thread. See [Testing plugins](../testing.md) for everything the
test host offers.

The tests talk to a real fake plug, started on a free port for each test, rather than to a mocked
`fetch`. Copy the fake into your plugin:

```sh
mkdir -p plugins/smart-plug/src/fake
cp examples/smart-plug/src/fake/FakePlug.ts plugins/smart-plug/src/fake/
```

Then create `plugins/smart-plug/src/SmartPlugPlugin.test.ts`. It uses `node:test` and
`node:assert/strict`, and sits next to the code it tests.

<!--@code: ../../../../../examples/smart-plug/src/SmartPlugPlugin.test.ts#imports-->

First, a helper. Every test gets a fresh plug, and `started()` starts the plugin against it:

<!--@code: ../../../../../examples/smart-plug/src/SmartPlugPlugin.test.ts#setup-->

- `PluginTestHost.start(SmartPlugPlugin, { config, clock })` does what a real start does: it
  validates the config, builds the plugin and runs `start()`. The `config` is what the user would
  type; defaults are applied.
- `TestClock` is the plugin's clock. Time only moves when you say so, so a test never sleeps.

### The connection test

<!--@code: ../../../../../examples/smart-plug/src/SmartPlugPlugin.test.ts#test-connection-->

`PluginTestHost.testConfig()` runs your `static test()` without starting the plugin, exactly as the
**Test connection** button does. The second half starts a plug, stops it, and checks that the error
is the readable one.

### An answer that isn't a plug's

<!--@code: ../../../../../examples/smart-plug/src/SmartPlugPlugin.test.ts#unexpected-->

This is the check from the client step, tested: a server that answers something else is refused
with a message that names the address.

### Sensors

<!--@code: ../../../../../examples/smart-plug/src/SmartPlugPlugin.test.ts#sensors-->

`host.addSensor("meter", { reading: "power" })` adds a signal like the user does, by capability
`id` and params. `host.values(signal)` is what it emitted so far. `clock.advance(5000)` moves
time forward and runs the poll timer. `host.next(signal)` waits for the next value, and is called
**before** the time moves, so the value can't slip past.

### The actuator

<!--@code: ../../../../../examples/smart-plug/src/SmartPlugPlugin.test.ts#switch-->

`host.actuate(button, value)` sends a command and resolves when `run()` has finished. A plug that
switched on and a sensor that followed is the whole feature.

### The plug that goes away

<!--@code: ../../../../../examples/smart-plug/src/SmartPlugPlugin.test.ts#unplugged-->

`host.status` is the instance's reported status. The test stops the fake, polls, checks
*degraded*, brings a plug back on the same port and checks *running*.

### Catalog and panel

<!--@code: ../../../../../examples/smart-plug/src/SmartPlugPlugin.test.ts#catalog-panel-->

Always `await host.stop()` in `finally`. It disposes the plugin, which clears its timers. A test
that leaves a timer behind keeps `node --test` from exiting.

### Run them

For this file alone, from the repository root:

```sh
node --conditions=@lox-nexus/source --import tsx --test plugins/smart-plug/src/SmartPlugPlugin.test.ts
```

```
ℹ tests 6
ℹ pass 6
ℹ fail 0
```

`npm test` runs every test of the repository, yours included, because it picks up
`plugins/*/src/**/*.test.ts`. So do `npm run lint` and `npm run typecheck`; run all three before you
call a change done.

## Build

Nexus runs your plugin from `src/` while you develop. To hand it to someone, build one
self-contained file:

```sh
npm run build -w @lox-nexus/plugin-smart-plug
```

This writes `plugins/smart-plug/dist/plugin.js`, which is what the manifest's `entry` names. It
holds your code and everything it imports, including the SDK and zod, so it is large (hundreds of
kilobytes) and needs no `node_modules` next to it. Installing never runs `npm`. Native modules can't be
bundled; see [Publishing a plugin](../publishing.md#what-may-be-bundled).

## Install it as a ZIP file

A ZIP file needs `package.json` and the bundle named by `entry`, nothing else. Pack them:

```sh
cd plugins/smart-plug
zip -r ../../smart-plug-0.1.0.zip package.json dist
```

Without `zip`, Python can do it (also on Windows):

```sh
python3 -m zipfile -c ../../smart-plug-0.1.0.zip package.json dist
```

or PowerShell: `Compress-Archive -Path package.json, dist -DestinationPath ..\..\smart-plug-0.1.0.zip`.
Windows PowerShell 5 may write backslashes into the entry names, which the installer refuses; use
the Python command or WSL then.

The layout is what matters: `package.json` at the root of the archive, and the bundle at the path
`entry` names (`dist/plugin.js`). A `README.md` next to `package.json` is shown on the plugin's card
as **Read me**.

Your development copy and the ZIP have the same plugin id, and a development copy takes
precedence. To see the installed one, restart the server with the development directory switched
off:

```sh
NEXUS_DEV_PLUGINS_DIR= npm run dev
```

Then, in the web interface:

1. Open **Plugins** and the tab **Installed**, and press **Install plugin**.
2. Choose the tab **ZIP file**, pick `smart-plug-0.1.0.zip`, tick **I trust this source**, and press
   **Fetch and check**. Trusting matters: checking starts the plugin's code once in a throwaway
   worker to learn which sensors and actuators it offers.
3. The review shows the plugin's name and version, where it comes from (the file name and its
   sha256), the bundle's sha256, and what changes for existing instances. Press **Install**. (The review may list *New required
   settings: address* for an instance that already has one. That is a known quirk when no version
   was installed before; ignore it, the install works.)

The card **Smart plug** appears on the **Installed** tab, and **Add instance** offers it. Everything
you built runs from the installed copy now.

To release a new version, raise `version` in `package.json`, build, pack and install again: running
instances restart on it, and the version before stays for a rollback. The same version with a
different bundle is refused, so raise it whenever the bundle changes. Other ways to hand out a
plugin (a git repository), what a README should say, and the license are on the
[Publishing](../publishing.md) page.

## Where to go from here

You have used a settings form, a test, a shared poll, sensors, an actuator, a status, a catalog and
a panel. The [plugin guide](../authoring.md) has a page for each, and for what the tutorial left
out:

- [Webhooks](../guide/webhooks.md), when the other system pushes to you.
- [Buttons on the instance page](../guide/panel.md#actions-buttons-on-the-instance-page), for
  pairing a device or opening a window.
- [Watching signals](../guide/watching.md), to write an exporter.
- [Settings](../guide/settings.md): secrets, tokens, a **Find** button, migrating settings
  between versions.
- [Lifetimes, timers and time zones](../guide/lifetimes.md) and [Logging, store and
  status](../guide/logging-and-store.md).
- [Values](../values.md): the types a signal can carry.
- [SDK at a glance](../sdk-at-a-glance.md) when you need a signature.

The first-party plugins, such as [Fronius](../fronius.md) and [Home Assistant](../homeassistant.md),
are built from the same pieces.
