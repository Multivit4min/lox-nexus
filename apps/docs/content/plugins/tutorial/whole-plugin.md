# The whole plugin on one page

For readers who know what a sensor and an actuator are and want to see how they fit together: the
plugin class of the tutorial in one piece. Each part is explained in the steps
([settings](first-plugin.md), [sensors](sensors.md), [the actuator](actuator.md),
[status, catalog and panel](finishing.md)).

<!--@code: ../../../../../examples/smart-plug/src/SmartPlugPlugin.ts-->

The rest of the plugin is small:

- [`SmartPlugConfig.ts`](first-plugin.md#add-settings), the settings schema.
- [`PlugClient.ts`](first-plugin.md#a-small-client), the HTTP client with checked answers and
  readable errors.
- [`sensors/MeterSensor.ts`](sensors.md#the-first-sensor) and `sensors/SwitchedOnSensor.ts`.
- [`actuators/SwitchActuator.ts`](actuator.md#the-switch).
- [`SmartPlugPlugin.test.ts`](tests-and-install.md#tests), the tests.

All of it is in
[`examples/smart-plug/`](https://github.com/Multivit4min/lox-nexus/tree/main/examples/smart-plug)
in the repository.
