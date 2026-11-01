# Sensors: values from the device

A sensor carries a value from the device to Nexus. You write one for every kind of reading.

A sensor turns something your device reports into values on the bus. One instance of your class
exists per configured signal, created with validated `params`. The simplest sensor listens to a
poller that the plugin owns:

```ts
import { Sensor, z } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"

export class PowerSensor extends Sensor<MyPlugin, { path: string }> {
  static readonly id = "power"                    // stored with the signal: don't rename
  static readonly label = "Power"
  static readonly description = "The power the inverter reports"   // shown when adding it
  static readonly params = z.object({ path: z.string().describe("Where the value is in the data, e.g. site.P_PV") })
  static readonly valueType = "number"            // what emit() sends; "any" if it varies

  override start() {
    this.listen(this.plugin.poller, "data", (data: Record<string, number>) => this.update(data))
    if (this.plugin.poller.latest) this.update(this.plugin.poller.latest)   // don't wait for the next poll
  }

  private update(data: Record<string, number>) {
    const watts = data[this.params.path]
    if (watts === undefined) this.fail(`no value at ${this.params.path}`)
    else this.emit(Value.number(watts))
  }
}
```

## `emit(value)`

Sends a value to the bus. It is safe to call on every poll: **equal consecutive values are dropped**
on the bus, so you do not compare with the previous one yourself. A value of the wrong type is
converted to the declared `valueType` ([Values](../values.md#conversions)). A call after the sensor is
disposed does nothing, so a late callback is harmless. An `emit()` also clears an earlier `fail()`.

Note the last line of `start()` above: **a new sensor has no value until it emits.** If your data is
already in memory when a signal is added (the user adds a sensor to a running poller), emit it from
`start()`. Otherwise the signal stays empty until the next change.

## `fail(message)` and `recover()`

`fail(message)` says that this sensor cannot deliver any more, for example because the entity it
follows was deleted. The message shows on the signal and on the instance's error topic, and the last
value stays. It lasts until the next `emit()`.

`recover()` ends the failure when the sensor works again but there is no value to send (an entity
that is back but reports "unavailable"). It only tells the host after a `fail()`, so it is cheap to
call on every change. Use `fail()` for one signal and `status.set("degraded")` for the whole device.

## `params`, `plugin` and `signal`

- **`this.plugin`** is your plugin instance, for what sensors share (the poller above).
- **`this.params`** are the validated params, with defaults applied. Field initializers can use
  both already, just like a plugin's `this.config`:
  `private readonly path = this.params.path.split(".")`.
- **`this.signal`** is `{ id, label }` of the configured signal this sensor is: the stable id and
  the name the user gave it (an empty label with hosts that don't send it). Use it in log lines.
  If you declare your own constructor, pass the arguments on to `super()`, including the signal.
- **`this.clock`** is the plugin's clock, see [Time](lifetimes.md#time-and-time-zones).

## `start()` for a sensor

Optional. It runs once when the signal is added, after construction. A rejected `start()` makes
adding the signal fail, and the user sees the message. It has 30 seconds like all requests to the
plugin. Register listeners and timers here, as in the example.

Declare `valueType` as precisely as you can: wires and the UI use it to offer fitting targets.
