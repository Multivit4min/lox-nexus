# 3. Sensors

In this step the plugin reads the plug every few seconds and offers two sensors: the power and
whether the plug is on. You see live values in the instance's signal list and in the Bus
Inspector, and you can send them to a Miniserver.

## Read the plug once, for all sensors

A sensor is a class, and there is one object per signal the user adds. If every sensor asked the
plug itself, ten signals would mean ten requests every few seconds. So the **plugin** reads the plug
once and tells its sensors about each reading. They listen to the plugin.

Open `SmartPlugPlugin.ts` again. The imports grow by two lines:

```ts
import { EventEmitter } from "node:events"
import { Plugin } from "@lox-nexus/plugin-sdk"
import { PlugClient, type PlugStatus } from "./PlugClient.ts"
import { smartPlugConfig, type SmartPlugConfig } from "./SmartPlugConfig.ts"
```

Replace the hello `start()` of the last step. The things the sensors will share come first, below
`static test`:

<!--@code: ../../../../../examples/smart-plug/src/SmartPlugPlugin.ts#state-->

- `client` is built from the settings. Field initializers run after `this.config` is ready, so
  this works.
- `readings` is an ordinary `EventEmitter`. The sensors listen to it.
- `latest` is the last reading, so a sensor added later has a value to start with.
- `lastRead` and `problem` are for the panel and the status, in [step 5](finishing.md).
- `polls` and `newest` number the readings, see the first point below.

Then `start()` and the read itself:

<!--@code: ../../../../../examples/smart-plug/src/SmartPlugPlugin.ts#start-->

<!--@code: ../../../../../examples/smart-plug/src/SmartPlugPlugin.ts#poll-->

How this works, and where it bites:

- **Readings are numbered.** `poll()` runs on a timer, and the switch in step 4 calls it too, so
  two readings can be under way at once. If the older one finishes last, its answer would
  overwrite the newer one and *Switched on* would flip back. Each reading takes a number, and one
  that finishes after a newer one is dropped (`if (poll < this.newest) return`).
- **`this.every(ms, fn)` is the timer.** Never use `setInterval` in a plugin. `every()` belongs to
  the plugin, so Nexus stops it when the instance stops or restarts. A bare `setInterval` keeps
  running, and after a few restarts you have several of them.
- **`every()` waits `ms` before its first run.** That is why `start()` also calls `poll()` once.
- **Don't `await` the first poll in `start()`.** `void this.poll()` starts it and lets `start()`
  finish. If you awaited it, an unplugged plug would hold up the start of the whole instance, and
  past the time `start()` is given ([limits](../guide/limits.md)) Nexus treats the worker as hung
  and restarts it. A plugin that works without its first reading should start in the background
  and report trouble as a status.
- **`this.clock.now()` instead of `Date.now()`.** It is the same time in production, and tests can
  move it by hand.
- **`poll()` must not throw.** It is `async` and called with `void`, so nobody awaits it. If it
  threw, the error would become an unhandled rejection: Nexus catches it, logs it (through
  `unhandledRejection()`) on every poll, and the status would never go to *degraded*. The `catch`
  block turns a failed reading into a status instead; [step 5](finishing.md) tries it out.

## The first sensor

Create `plugins/smart-plug/src/sensors/MeterSensor.ts`. One class reads either the power or the
energy, depending on a *param* the user picks:

<!--@code: ../../../../../examples/smart-plug/src/sensors/MeterSensor.ts-->

What each part is for:

- **`static id`** names this kind of sensor. It is stored with every signal the user adds, so
  **never rename it** once someone uses your plugin: their signals would point at nothing.
- **`label` and `description`** are what the user sees when choosing what to add. One sentence of
  description tells more than the label alone.
- **`params`** is a zod schema like the settings, but for one signal. Here it asks which reading
  the signal follows. Nexus validates it and gives it to you as `this.params`, with defaults
  applied.
- **`valueType = "number"`** says what `emit()` sends. Wires and the interface use it to offer
  fitting targets; declare it as precisely as you can.
- **`this.plugin`** is your `SmartPlugPlugin`. That is how a sensor reaches `readings` and `latest`.
- **`this.listen(emitter, event, fn)`** subscribes and unsubscribes by itself when the sensor is
  removed. Use it instead of `emitter.on`, or a removed signal would keep receiving.
- **`this.emit(value)`** sends a value to the bus. Call it on every reading; the bus drops a value
  equal to the one before, so you don't compare yourself.
- **The `if` after `listen`.** A new sensor has no value until it emits. If the user adds a signal
  between two readings, it would stay empty until the next one, so it emits the latest at once.

The values are built with `Value.number(…)`. All value types are on the [Values](../values.md)
page.

The second sensor needs no params. `plugins/smart-plug/src/sensors/SwitchedOnSensor.ts`:

<!--@code: ../../../../../examples/smart-plug/src/sensors/SwitchedOnSensor.ts-->

Finally, tell the plugin about both. Add the imports for the two sensors, and below
`static readonly config` in `SmartPlugPlugin.ts`:

```ts
static readonly sensors = [MeterSensor, SwitchedOnSensor]
```

Sensors, actuators and the config are *static* so that Nexus can describe the plugin, to build its
forms, without starting it.

## Try it

Save. The instance restarts and still shows **running**.

1. On the instance page, the card **Sensors and actuators** now has the buttons **Add from
   catalog** and **Add manually**. Press **Add manually**.
2. The dialog lists *Read from the device · sensors*: **Meter** (number) and **Switched on**
   (on/off), each with the description you wrote. Pick **Meter**.
3. The form shows the **Name**, prefilled with *Meter*. Change it to `Power`. Under **Settings**,
   **Reading** offers *Power now (W)* and *Energy used so far (kWh)* (the `enumLabels` in the
   params); keep *Power now*. Type `W` as the **Unit**, which only
   changes how the value is shown. Press **Add sensor**.
4. Add **Switched on** in the same way. Keep its name.

The list now has two rows. The **Topic** of the first is `smart-plug/desk-lamp/sensor/power`, and
its **Value** is `0 W`: the plug is off.

Switch the fake plug on from a terminal:

```sh
curl -X POST -H 'content-type: application/json' -d '{"on": true}' http://127.0.0.1:8090/switch
```

Within five seconds (the default **Read every**) *Switched on* turns to on and *Power* to about
60 W. The fake plug's draw wobbles a little, so *Power* keeps changing.

### In the Bus Inspector

Every signal is a topic on Nexus' bus. Open the menu under your user name at the top right and
choose **Bus Inspector**. In the field *topic pattern* type `smart-plug/#` and press Enter (`#`
means everything below). **Messages** lists each value as it is published. Click a message to see
it in detail: its value, who sent it (your plugin instance), and a **Cause chain**. Readings have no
cause; in the next step you will see commands that have.

Switch the plug off and on again and watch the messages. Notice that *Switched on* is published
only when it **changes**, while *Power* changes with every reading: the bus drops a value equal to
the one before.

### To a Miniserver (optional)

The signals are on the bus, but nothing uses them yet. This is a [wire](../../guide/wires.md) to a
Miniserver. It needs a Miniserver that you have set up as described in
[Setting up a Miniserver](../../guide/loxone.md).

1. In the signal list, tick **Power**. The button **Connect 1 to a Miniserver…** appears above the
   list. Press it.
2. In the dialog **Connect to a Miniserver**, choose the Miniserver. The row shows the signal with
   an arrow towards the Miniserver, a *Loxone name*, the *Data type* (**Analog**, because the
   sensor is a number) and a *Packet id* Nexus has suggested. Press **Connect 1**.
3. The result lists what was created: a Miniserver **output** (a signal that Nexus sends to the
   Miniserver) and a wire from your sensor to it. The wire is also on the **Wires** page. The
   current value goes to the Miniserver at once.

In Loxone Config the Nexus peer now has an input with that packet id, as described on the
[Miniserver page](../../guide/loxone.md#signals). Wire it to anything, a display or a virtual
input, and the plug's power shows in Loxone.

## What just happened

You wrote a plugin that polls a device and publishes what it finds. Between your code and the
Miniserver there are three steps you did not write: the *signal* (a sensor the user added), the
bus, and the *wire*. The user chose which readings exist and where they go; your plugin only said
what is available and delivered the values.

Next, the other direction: [step 4, an actuator](actuator.md).
