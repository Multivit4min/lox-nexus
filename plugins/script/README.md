# Script plugin

Runs a piece of JavaScript you write in the instance settings. The script sends values to the
instance's sensors with `nexus.set` and reacts to what its actuators receive with `nexus.on` and
`nexus.get`. Wires connect those sensors and actuators to Loxone or to other plugins.

## What it does

- **Sensors:** values the script sends with `nexus.set(name, value)`, as a number, a text or a
  switch.
- **Actuators:** values sent to the script. Every `nexus.on(name, handler)` handler runs with each
  one, and `nexus.get(name)` returns the latest.
- **Catalog:** the variable names the script used since its start, as ready-made sensors and
  actuators.
- **Panel:** the script's state, its time zone, its uncaught errors, and a table of its variables.

Typical uses: compute a value from several others, format a text for a Loxone display, call an
HTTP API that has no plugin of its own, or keep a small state machine.

```js
nexus.on("setpoint", value => {
  nexus.set("setpoint-text", `Target ${value} °C`)
})
```

## Before you start

- Nothing to install outside Nexus. You need some JavaScript, and network access from the Nexus
  server to any HTTP API the script calls with `fetch`.
- A script is trusted code that runs inside Nexus. Only let people you trust edit the instance.
- For the local time in `Date`, let Nexus read your Loxone project once (import signals from the
  Miniserver or a project file), or fill in **Time zone**.

## Configuration

| Field | | Description |
|---|---|---|
| **Script** (`script`) | optional; default: a commented example script | The JavaScript the instance runs, up to 200 000 characters, edited in a code editor. Saving the instance restarts it with the new code. Example: `nexus.set("hello", "world")`. |
| **Time zone** (`timeZone`) | optional; no default | IANA zone the script's `Date` works in, for example `Europe/Vienna`. Leave it empty to use the zone of the Loxone project Nexus read last, or else the server's (in a container usually UTC). An unknown zone is refused when saving. |

## Sensors and actuators

| Kind | Name (id) | Value | What it is |
|---|---|---|---|
| sensor | Number (`number`) | `number` | A number the script sends with `nexus.set` |
| sensor | Text (`text`) | `string` | A text the script sends with `nexus.set` |
| sensor | Switch (`switch`) | `boolean` | An on/off value the script sends with `nexus.set` |
| actuator | Number (`number`) | `number` | A number the script receives with `nexus.on` or `nexus.get` |
| actuator | Text (`text`) | `string` | A text the script receives with `nexus.on` or `nexus.get` |
| actuator | Switch (`switch`) | `boolean` | An on/off value the script receives with `nexus.on` or `nexus.get` |

## Good to know

- Every sensor and actuator has one param, **Variable** (`name`): the name the script uses, 1 to
  64 letters, digits, `_`, `.` or `-`. Several signals may share a name.
- Every start (saving, a restart, a crash) runs the script from the top in a fresh context. Timers,
  handlers and variables of the previous run are gone; only `nexus.store` survives.
- `nexus.set` sends at most one value per name every 100 ms; the latest one wins.
- A syntax error or an endless loop at the top level fails the start. An error in a timer or
  handler is logged with its line and shown in the panel, and the script keeps running.
- The script gets no `require`, `process` or `Buffer`. It reaches Nexus through `nexus` and the
  network through `fetch`.

## More

The full reference (how a script runs, the `nexus` API and `nexus.store`, globals, time zone and
`Date`, catalog, panel, the template, limits, security, differences from the old integration,
development) is in `REFERENCE.md` next to this file, and on the plugin's page in the Nexus
documentation.
