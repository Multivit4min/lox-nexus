# SDK reference

This is the place to look things up: every class, method, type and helper of the plugin SDK, with
what it does, what it returns and what to watch out for. It is generated from the comments in the
SDK's source, so it matches the code you install.

New to writing plugins? Start with the [tutorial](../../plugins/tutorial/index.md), which builds a complete
plugin step by step, and come back here when you want the details of one class.

## The classes you meet first

In the order you need them when you write a plugin:

1. {@link @lox-nexus/plugin-sdk!Plugin | Plugin}: the class you write once per integration. It
   starts the work (usually a poller), holds what the sensors share and offers a catalog and a panel.
2. {@link @lox-nexus/plugin-sdk!Sensor | Sensor}: a value that comes from the device. It sends
   values with `emit()`.
3. {@link @lox-nexus/plugin-sdk!Actuator | Actuator}: a command that goes to the device.
   Its `run()` receives the value a Loxone output sent.
4. {@link @lox-nexus/plugin-sdk!Action | Action}: something the user starts with a button on the
   instance page, such as pairing a device.
5. {@link @lox-nexus/plugin-sdk!Disposable | Disposable}: the base of all of the above. Timers,
   listeners and child objects you register with `every()`, `after()`, `listen()` and `own()` are
   cleaned up for you.
6. {@link @lox-nexus/plugin-sdk!PluginEntry | PluginEntry}: the one line that exports your plugin
   so Nexus can load it.
7. The settings helpers, which mark config fields so the form shows the right input:
   {@link @lox-nexus/plugin-sdk!secret | secret}, {@link @lox-nexus/plugin-sdk!token | token},
   {@link @lox-nexus/plugin-sdk!duration | duration}, {@link @lox-nexus/plugin-sdk!slider | slider},
   {@link @lox-nexus/plugin-sdk!file | file} and more. Find them under "Settings form".
8. {@link @lox-nexus/plugin-sdk/testing!PluginTestHost | PluginTestHost} and
   {@link @lox-nexus/plugin-sdk/testing!TestClock | TestClock}: run your plugin in a test
   without a Nexus server and move time by hand.

## The four modules

- {@link @lox-nexus/plugin-sdk! | @lox-nexus/plugin-sdk}: the main entry. The classes above, the
  settings helpers, and the types for catalog, panel, webhooks and watching signals, grouped by topic.
- {@link @lox-nexus/plugin-sdk/values! | @lox-nexus/plugin-sdk/values}: `Value`, the typed value that
  flows between signals, and the converter that wires use between value types.
- {@link @lox-nexus/plugin-sdk/testing! | @lox-nexus/plugin-sdk/testing}: `PluginTestHost` and
  `TestClock` for your plugin's tests.
- {@link @lox-nexus/plugin-sdk/wire! | @lox-nexus/plugin-sdk/wire}: the messages between Nexus and a
  plugin worker. You rarely need it; it is for tools and hosts.

## How to read a class page

- **Static declarations** (`static readonly id`, `config`, `sensors`, ...) are not members of the
  class page. You write them in your subclass; the plugin's, sensor's, actuator's and action's
  declarations are listed on the `PluginClass`, `SensorClass`, `ActuatorClass` and `ActionClass`
  types on the main module page.
- **Instance members** are what you call or override on `this`: properties and accessors such as
  `this.config`, `this.log` and `this.plugin`, and methods such as `start()` and `run()`.
- **Protected** members (`emit()`, `fail()`, `recover()`, `every()`, `own()`, ...) are for your
  subclass only: call them from inside your class, not from outside.
- **Inherited from** shows members that come from {@link @lox-nexus/plugin-sdk!Disposable | Disposable}.
- Examples on a page use the smart plug from the tutorial: a plug read over HTTP, with a meter
  sensor and a switch actuator.
