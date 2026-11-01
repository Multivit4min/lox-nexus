# 4. An actuator

In this step the plugin learns to switch the plug. You press a button in the Bus Inspector and
the fake plug turns on, and you can connect a button in Loxone to it.

## The switch

An actuator is the opposite of a sensor: a command arrives from Nexus and your code carries it out.
Create `plugins/smart-plug/src/actuators/SwitchActuator.ts`:

<!--@code: ../../../../../examples/smart-plug/src/actuators/SwitchActuator.ts-->

- **`accepts = "boolean"`** is the type `run()` wants. Whatever arrives is converted first. A
  Loxone digital output sends a 1 or a 0, an analog one a number; by the time `run()` is called it
  is a boolean. Keep the last type parameter of `Actuator` (`ValueOf<"boolean">`) in line with it,
  so `value.value` is a `boolean` for the compiler as well. The default, `"any"`, passes values on
  unchanged.
- **`run(value)` does the work and is awaited.** The command counts as done when its promise
  settles, and that moment, with its duration, is reported on the bus. If you returned early, the
  command would show as done while the plug has not switched.
- **To report a failure, throw an `Error` with a message a person can read.** Here `PlugClient`
  already does: *can't reach the plug at …*. It is shown as the reason the command failed. Don't
  catch errors just to hide them.
- **`concurrency = "latest"`.** What if a command arrives while the previous one still runs?
  `"queue"` (the default) runs them all, in order. `"latest"` keeps only the newest waiting one: a
  button pressed five times only needs the last press to reach the plug, and the skipped commands
  are reported as superseded. Commands to one actuator never overlap either way.
- **`await this.plugin.poll()`** reads the plug right after switching, so *Switched on* follows at
  once instead of at the next reading. `poll()` is the plugin's method from the last step.
- **No `params`.** The class says `Record<string, never>` for them. A plug with several outlets
  would take the outlet number as a param.

Register it in `SmartPlugPlugin.ts` with its import. The declarations of the class are now
complete:

<!--@code: ../../../../../examples/smart-plug/src/SmartPlugPlugin.ts#declarations-->

## Try it

Save, and open the instance page.

1. Press **Add manually** in **Sensors and actuators**. The dialog now has a second group,
   *Control the device · actuators*, with **Switch** (on/off). Pick it.
2. Keep the name **Switch** and press **Add actuator**.

The list has a third row with the topic `smart-plug/desk-lamp/actuator/switch`. Now send it a command
without a Miniserver: open the **Bus Inspector** (the menu under your user name), press
**Inject**, and fill in:

- **Topic**: `smart-plug/desk-lamp/actuator/switch`
- **Value**: type `boolean`, value `true`
- switch on **Send as command (not retained, never deduplicated)**. Without it, the value is
  published as if the signal had it, and the actuator does not act.

Press **Inject**. Check the plug:

```sh
curl http://127.0.0.1:8090/status
```

`"on":true`. The sensor *Switched on* turns on at once as well. In the Inspector, set the topic
pattern to `smart-plug/#` if it isn't already, and click the command. Its **Cause chain** shows the
readings your plugin published *because of* that command: Nexus attributes everything a plugin emits
or logs while `run()` is active to the command that started it, without you passing anything
around. Inject `false` to switch the plug off again.

### From a button in Loxone (optional)

This needs a Miniserver, set up as in [Setting up a Miniserver](../../guide/loxone.md).

1. In the signal list, tick **Switch** and press **Connect 1 to a Miniserver…**.
2. The row shows an arrow *from* the Miniserver: the actuator is controlled by it. The suggested
   *Data type* is **Digital**. Press **Connect 1**.
3. Nexus creates a Miniserver **input** (a signal the Miniserver sends to Nexus) and a wire from it
   to your actuator. Nothing is sent to the plug until the Miniserver sends a value.

In Loxone Config the Nexus peer has an output with that packet id. Connect a button or a switch to
the peer's output, save the project to the Miniserver, and press the button: the plug follows.

## What just happened

A value travelled from a Miniserver input along a wire into your actuator, was converted to a
boolean on the way, and ended in your `run()`. You didn't write the wire or the conversion, only
what happens at the end. The reverse also holds: **a new sensor or actuator needs no change to
anything else in Nexus.** The user adds it and connects it.

Next: what happens when the plug goes away, and a nicer interface:
[step 5](finishing.md).
