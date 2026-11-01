# Actuators: commands to the device

An actuator carries a command from Nexus to the device. You write one for every kind of command.

An actuator is the opposite direction: a command arrives and your code carries it out.

```ts
import { Actuator, z } from "@lox-nexus/plugin-sdk"
import type { ValueOf } from "@lox-nexus/plugin-sdk/values"

export class SwitchActuator extends Actuator<MyPlugin, { id: string }, ValueOf<"boolean">> {
  static readonly id = "switch"
  static readonly label = "Switch"
  static readonly description = "Turns a device on or off"
  static readonly params = z.object({ id: z.string() })
  static readonly accepts = "boolean"             // wires convert to this before run()
  static readonly concurrency = "latest"          // or "queue" (default)

  async run(value: ValueOf<"boolean">) {
    await this.plugin.api.set(this.params.id, value.value)   // throwing reports a failed result
  }
}
```

## `run(value)`

Performs the command. It is called with the value **already converted to `accepts`**, so a wire from
an analog input to your boolean actuator just works. `"any"` (the default) passes values unchanged.
Keep the generic `V` of `Actuator` in line with `accepts`.

`run()` ends when its promise settles, and **that is the moment the result is reported**, with the
duration, as a *result* message under the command on the bus. So:

- `await` the real work. If you return early, the command shows as done while the device is not.
- To report a failure, **throw or reject with an `Error` whose message a user can read**
  ("device returned 503"). It is shown as the failure reason. Do not swallow errors.
- Nexus marks a command as failed after **30 seconds** without an answer, but cannot stop your
  `run()`. Give your requests their own, shorter timeout.
- `run()` never overlaps itself, see below.

**Replays.** When a plugin starts, Nexus delivers an active force on its actuators again, since a
restarted plugin (or a device that rebooted with it) may no longer match it. `run(value, command)`
tells it apart from a new command with `command.replayed`. An actuator whose command does
something drastic, restarting a device or opening a door, should return without acting on a replay:

```ts
async run(value: ValueOf<"boolean">, command?: ActuatorCommand) {
  if (command?.replayed || !value.value) return
  await this.plugin.api.restart(this.params.device)
}
```

## `concurrency`

What if a command arrives while the previous one is still running?

- `"queue"` (default) runs every command, in order, one at a time. Use it when each command
  matters (a pulse, a switch).
- `"latest"` keeps only the newest waiting command. A dimmer dragged across its range sends many
  values; only the last matters, and the device is not flooded. The commands that were skipped are
  reported as *superseded* (`SupersededError`, raised by the runtime, not by you).

## `accepts`, `params`, `signal`, `start()`

`accepts` is described in [Values](../values.md#choosing-types-for-your-signals). `params`, `plugin`,
`signal` and `clock` work as for sensors, and field initializers can use `this.plugin` and
`this.params`. `start()` is optional setup, called once before the first `run()`; a rejection makes
adding the signal fail.

## `fail(message)` and `recover()` for an actuator

An actuator that can't work for a while, for example because the device it controls was deleted,
calls `fail(message)`. The message shows on the signal and on the instance's error topic, like a
sensor's, until `recover()`. Unlike a sensor, nothing clears it by itself: call `recover()` when
the cause is gone. It only tells the host after a `fail()`, so it is cheap to call on every change.
Commands still reach `run()` meanwhile; throw there with the same message.

Prefer this to rejecting in `start()`: a rejected signal can't be added at all, while a failed one
stays configured and recovers when the device comes back.

## Causes are automatic

Whatever the plugin emits or logs while an actuator runs carries the bus message that triggered
it, so the Bus Inspector shows the effect under its cause. This follows awaits, timers and promises
started inside `run()` for as long as they live, so work that outlives the command (a timer you
start in `run()`) is still attributed to it. You do not pass anything around.
