# Wires

A wire sends the values of a **source** signal to a **target** signal, optionally changing them on
the way. Typical wires:

- a Fronius sensor (PV power) to a Miniserver analog output, scaled to the range the Miniserver expects
- a Miniserver digital input (a push button) to a Home Assistant light actuator
- a calendar sensor ("event active") to a Miniserver digital output

The **Wires** page lists every wire. Miniserver and plugin pages show the wires of their own
signals, and each signal row has a button that starts a new wire at that signal.

## Rules

- Sources are Miniserver **inputs** (values Nexus receives) and plugin **sensors**. Targets are
  Miniserver **outputs** and plugin **actuators**.
- A target can be fed by **one** wire.
- Values are converted to the target's type at the end, see [Values](../plugins/values.md#conversions).
- After a restart, values restored from the last snapshot are **not** forwarded, so a reboot never
  actuates a device with stale data. Enable *sync on start* on the wire if you want the opposite.
- A value that passes the same wire twice within one chain of causes is dropped and a warning
  appears on the bus. A chain is also cut after 16 hops. This stops loops inside Nexus; a loop
  through an external system (for example Loxone to Home Assistant and back) is not visible to Nexus, so use
  throttling and forces to stop it.

## Transforms

A wire has an ordered list of up to 50 steps. Each step receives the output of the previous one.

| Step | Settings | Effect |
|---|---|---|
| `invert` | none | Converts the value to boolean and negates it. |
| `scale` | `from` [min, max], `to` [min, max], `clamp` | Maps a number linearly. `from` must not be empty. Without `clamp` the result extrapolates beyond `to`. Example: 0 to 10000 W into 0 to 100. |
| `map` | cases `when` to `then`, optional `else` | Replaces matching values. Matching is type-strict (the number 1 does not match `true`). The first matching case wins. Unmatched values become `else`, or pass unchanged without it. |
| `debounce` | `ms` | Forwards the latest value once nothing new arrived for `ms`. |
| `throttle` | `ms` | Forwards the first value immediately, then at most one per `ms`; the latest value of a window is sent at its end. |
| `convert` | `to` type | Converts to a type explicitly, for example number to string. |

`ms` is 1 to 86 400 000 (one day). The wire editor shows a **preview**: each step's result for a
value you choose, and the type the target receives.

## Why a wire carries nothing

The wire card shows a level and a reason:

| Level | Meaning |
|---|---|
| ok | Values flow (or the source is forced, and the wire carries the forced value). |
| off | The wire is switched off. |
| idle | The source's owner sends nothing (a plugin that is not running, a Miniserver that is stopped, still waiting for its first packet, or silent), the target's owner isn't running, or the target is forced. |
| broken | The server cannot run the wire, for example a signal it uses was removed or has the wrong direction. The reason says which. |
