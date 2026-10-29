## How a script runs

The script exchanges values with the rest of Nexus only through the instance's own variables. It
has no access to the bus or to other instances.

- Saving the instance restarts it, and the restart loads the new code. Every start runs the script
  from the top in a fresh context: variables, timers and handlers of the previous run are gone.
  Only `nexus.store` survives.
- The code is the body of an `async` function, so `await` works at the top level and `return`
  ends the top level early. Line and column numbers in errors are those of your code.
- A **syntax error** fails the start. The instance goes to *error*, with a message like
  `syntax error at line 3, column 9: Unexpected token ')'`. A bracket, brace, string or comment
  left open is reported at the end of the last line as `unexpected end of the script`.
- The **synchronous part of the top level** (up to the first `await`) may take at most 1000 ms.
  A longer one, such as `while (true) {}`, fails the start as well, and the timers it started are
  cleared. Do long work in timers, in handlers or after an `await`.
- An **error at the top level** (thrown, or a rejected `await`) is logged with its line. The
  instance keeps running, because timers and handlers registered before the error still work. It
  is reported as **degraded** (`the script's top level failed: …`), since the script's setup most
  likely didn't finish. Only a restart clears it.
- An **error in a callback** (a timer or a `nexus.on` handler) is logged with the line and the
  script's stack. The instance stays running, and the panel shows the last error.
- A **promise rejected without a handler** (a forgotten `.catch`, as in
  `fetch(url).then(response => response.json())` when the server is down) is logged the same way,
  with the script's line where the stack has one, and counted in the panel. The instance stays
  running. Every unhandled rejection in the instance's worker counts as the script's, including
  those of promises that functions like `fetch`, `Response.json()` or `crypto.subtle` return.
- **Stopping** (or saving) the instance ends the script at once: timers are cleared, and requests
  in flight are aborted and never settle, so no `then`, `catch` or code after an `await fetch(…)`
  runs any more, and nothing is logged for them.
- Callbacks after the top level run without a time limit. A callback that never returns blocks the
  worker. Nexus notices that the worker stops answering its pings (after roughly 30 to 40 seconds),
  then terminates and restarts it.

## Sensor and actuator params

Every sensor and actuator takes the same params:

| Param | Form title | |
|---|---|---|
| `name` | Variable | The variable's name in the script: 1 to 64 letters, digits, `_`, `.` or `-` (`power`, `room.temp`, `pv-today`). |

- Sensors get the values the script sends with `nexus.set(name, …)`. Several sensors may use the
  same name, also with different types; each gets every value, converted to its own type.
- Actuators pass their values to `nexus.on(name, …)` handlers and `nexus.get(name)`. Wires convert
  whatever they carry to the actuator's type first, so a handler gets a number (`number`), a string
  (`text`) or `true` / `false` (`switch`).

## The `nexus` API

Variable names follow the rule above. Any other name throws a `TypeError`. The `nexus` object is
frozen.

### `nexus.set(name, value)`

Sends `value` to every **sensor** of this instance whose `name` param is `name`. Each sensor
converts it to its own type with the SDK's conversion: `"21,5"` becomes 21.5 for a number sensor
and `false` for a switch, which is on only for words like `"on"`, `"true"` or `"1"` (the full table
is in the plugin guide under *Values*, *Conversions*).

```js
nexus.set("power", 412.5)
nexus.set("status", "charging")
nexus.set("away", true)
```

| Script value | Sent as |
|---|---|
| number | number; `NaN` and `Infinity` throw a `TypeError` |
| string | text, at most 4096 characters (longer throws a `TypeError`) |
| boolean | boolean |
| `null`, `undefined` | null (an empty text, 0 or off for the sensor) |
| `Date` | its ISO text, `"2026-10-28T12:00:00.000Z"`; an invalid date throws a `TypeError` |
| a bus value object, e.g. `{ type: "rgbw", value: { red, green, blue, white, fadeTime, flags } }` | that value (checked; an invalid one throws a `TypeError`) |
| other objects and arrays | their JSON text, at most 4096 characters |
| function, symbol, BigInt, circular object | throws a `TypeError` |

- **Throttled per name:** the first call sends at once. Further calls within 100 ms replace each
  other, and the last one is sent when the 100 ms are over. So a sensor gets at most ten values a
  second, and always the latest one.
- **Names without a sensor are remembered.** A sensor added later starts with the latest value of
  its name, and the catalog offers the name. This also covers restarts: the top level runs before
  the signals are added again. At most 1000 names are remembered (see Limits).

### `nexus.on(name, handler)`

Calls `handler(value)` with each value an **actuator** of this instance named `name` receives.
Returns a function that removes the handler again. A handler that isn't a function throws a
`TypeError`.

```js
const off = nexus.on("light", on => {
  nexus.set("light-status", on ? "on" : "off")
})
// later: off()
```

- The value is a plain JavaScript value: a number, a string or a boolean, depending on the
  actuator (`number`, `text` or `switch`).
- Handlers may be `async`. The actuator's command waits for all handlers of the name. If one throws
  or rejects, the command fails with the script's message and line
  (`line 4, column 11: RangeError: too big`; several failures are joined with `; `), and the error
  is logged. The other handlers still run.
- Commands to one actuator are handled in order, one after the other, so a handler sees every
  value. A command waits at most **30 s** for its handlers. After that it fails with
  `a nexus.on handler did not settle within 30 s` and the next command runs; the slow handler
  itself keeps running. Give a handler that waits for something a shorter limit of its own, e.g.
  `fetch(url, { signal: AbortSignal.timeout(5000) })`.
- Several handlers per name are fine. A value with no handler is only stored for `nexus.get`.
- `nexus.on` throws a `TypeError` for a new name once the script uses 1000 names with `nexus.on`
  and `nexus.get`.
- In the Bus Inspector, values a handler sets (also after an `await`) appear under the command that
  called it. Values set from a timer callback have no cause, even when a handler started the timer,
  so an interval started by one command isn't attributed to it forever.

### `nexus.get(name)`

The latest value an actuator named `name` received, as for `nexus.on`, or `undefined` if none has
arrived since the start. Values are not kept across restarts, and the top level starts before the
actuators are added, so at the start of the top level `get` returns `undefined`. Use `nexus.on` to
react to values.

```js
nexus.on("button", () => {
  const target = nexus.get("target") ?? 21
  nexus.set("setpoint", target)
})
```

### `nexus.store.get(key)` / `nexus.store.set(key, value)`

A small persisted store that survives restarts and updates of the instance.

```js
const state = nexus.store.get("state") ?? { runs: 0 }
state.runs++
nexus.store.set("state", state)
```

- Keys are strings of 1 to 128 characters; anything else throws a `TypeError`. A value is at most
  64 KiB (65 536 characters) as JSON; a larger one throws a `TypeError`.
- Values must be JSON as they are: `null`, booleans, finite numbers, strings, arrays and plain
  objects, nested at most 64 levels deep. Anything else (`Map`, `Date`, functions, `NaN`, cycles,
  `undefined` in an array) throws a `TypeError` naming the part that is wrong. Object fields that
  are `undefined` are left out, as in JSON. Store a date as `date.toISOString()`.
- `get` returns a copy; change it and `set` it again to store the change. A missing key gives
  `undefined`. `set(key, undefined)` deletes the key.
- Each `set` is a write to the Nexus database. Store state that must survive a restart, not
  every value on every tick.

## Globals

| Global | |
|---|---|
| `nexus` | the API above |
| `console.log`, `info`, `debug`, `warn`, `error` | one line in the instance's log at the matching level (`log` is `info`). Arguments are joined with spaces: strings as they are, objects as indented JSON, errors with the script's part of their stack (and the message of their cause, where `fetch` puts the network error). |
| `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval` | as in browsers: ids are numbers, extra arguments are passed to the callback, a missing or invalid delay means "as soon as possible". Stopping the instance clears all of them. Intervals shorter than 10 ms run every 10 ms. |
| `fetch`, `Headers`, `Request`, `Response`, `AbortController`, `AbortSignal` | Node's fetch. Your own signal works, given in the options or with a `Request`. Stopping the instance aborts requests still in flight. |
| `URL`, `URLSearchParams`, `TextEncoder`, `TextDecoder`, `structuredClone`, `atob`, `btoa`, `crypto` | the web standard ones; `crypto` is Web Crypto (`crypto.randomUUID()`, `crypto.subtle`) |
| JavaScript's own | `Math`, `JSON`, `Date`, `Promise`, `Map`, `RegExp`, `Intl`, … |

Not available: `require`, `import()`, `process`, `Buffer`, `setImmediate` and Node's modules. A
script talks to Nexus through `nexus` and to the network through `fetch`.

## Time zone and `Date`

`Date` works in the instance's **Time zone** setting, or without one in the time zone of the
Loxone project: Nexus takes it from the project whenever it reads one (importing signals from the
Miniserver or from a project file), and the script gets it at its next start. Without a project
read yet it is the zone of the Nexus process (`TZ`), usually UTC in a container. The panel shows
which zone the script uses, with "(set in the instance)" when it comes from the setting.

These follow the zone: the local getters and setters (`getHours()`, `setDate()`, also `getYear()`
and `setYear()`), `getTimezoneOffset()`, `toString()`, `toDateString()`, `toTimeString()`, the
local forms of `new Date(2026, 9, 29, 10, 0)`, `new Date("2026-10-29T10:00")` and `Date.parse`,
`Date()` called without `new`, and the default zone of `toLocaleString()`,
`toLocaleDateString()` and `toLocaleTimeString()`. Across a clock change a time that occurs twice
is the earlier one and a skipped one moves forward, as JavaScript does for the local zone.

Texts with their own offset or zone (`…T10:00Z`, `…+01:00`, `GMT+0100`) and a bare ISO date
(`"2026-10-29"`, which the standard reads as UTC) keep their meaning; the zone doesn't change them. `Intl.DateTimeFormat` without
a `timeZone` option still uses the process's zone; pass `timeZone` there. So does a Date copied
with `structuredClone()`; copy one with `new Date(date)` instead.

## Catalog

Lists the variable names the script used since the start, ready to add:

- **From the script (nexus.set):** a sensor per name, typed by the last value (number, switch for
  booleans, text for anything else), with that value.
- **To the script (nexus.on, nexus.get):** an actuator per name, typed by the last value received,
  or `number` before the first one.

A section without names is left out. A name the script hasn't used yet (in a handler that hasn't
been called, say) isn't listed; add those signals by hand.

## Panel

Two sections:

- **Script:** *State* (`running, N timers active`, followed by `top level failed: …` if the top
  level failed), *Started*, *Time zone* (the zone its `Date` works in), *Uncaught errors* since the
  start, and *Last error* with its line and time.
- **Variables:** a table with a row per variable and direction, also for names only signals use.
  Columns: *Variable*, *Direction* (`from script (set)` or `to script (on, get)`), *Signals* (the
  number of sensors or actuators using it), *Last value*, *Calls* (`set` calls or values received)
  and *Last call*.

Times are ISO texts in UTC, or `never`. Counters live in memory and start at zero with every start.

## The template

A new instance starts with this script. It runs on a fresh instance without any signals:

```js
// Runs once when the instance starts, and again after every save.
//
// nexus.set(name, value)    sends a value to the sensors of this instance named `name`
// nexus.on(name, handler)   runs `handler` with each value an actuator named `name` receives
// nexus.get(name)           the latest value such an actuator received (undefined until then)
//
// Add sensors and actuators with these names on the instance page (the catalog lists the names
// this script used) and wire them to Loxone or other plugins.

// Publish the time as "HH:MM" at every full minute (sensor "time", type text)
function publishTime() {
  const now = new Date()
  nexus.set("time", now.toTimeString().slice(0, 5))
  setTimeout(publishTime, 60_000 - (now.getTime() % 60_000))
}
publishTime()

// React to a value from Loxone (actuator "light", type switch)
nexus.on("light", on => {
  console.info("light switched", on ? "on" : "off")
  nexus.set("light-status", on ? "on" : "off")
})
```

## Limits

| | |
|---|---|
| Script size | 200 000 characters |
| Synchronous top level | 1000 ms |
| `nexus.set` | one value per name every 100 ms (latest wins) |
| Text values | 4096 characters |
| Variable names | 1000 per direction: 1000 for `nexus.set`, and 1000 for `nexus.on` and `nexus.get` together. Names of configured signals count towards these, but always work. Past that, a new name given to `set` is dropped (it has no sensor, and is not remembered for the catalog, the panel or later sensors), `on` throws a `TypeError`, and `get` returns `undefined`. A warning is logged once per direction. |
| `nexus.on` handlers | a command waits 30 s for them |
| `nexus.store` values | 64 KiB as JSON, 64 levels deep |
| Log | 100 lines per 10 s. Further lines are dropped (they cost no formatting), and a warning with their number is logged together with the first line of a later window; a script that logs nothing more never reports it. A line, and the stack logged with an error, is at most 10 000 characters; longer ones end in `… (clipped)`. |
| Shortest interval | 10 ms |
| Memory | the worker's 128 MB heap |

## Security

The script runs in a separate `node:vm` context, but **that is not a sandbox**. Through the
functions it is given, code can reach the host's JavaScript objects. Treat a script like a plugin:
trusted code. Whoever can edit the instance's config can run code inside Nexus.

What does hold: every instance runs in its own worker thread with an empty environment (no
`process.env`, so no secrets of the server), a 128 MB heap, and only the globals listed above.
A crashed or hung worker is restarted by Nexus without affecting other instances.

## Differences from the old script integration

1. Stopping or saving the instance clears every timer, handler and request in flight. The old
   integration only terminated its worker.
2. The script no longer ends the worker (`process.exit`) when its top level returns. Timers and
   handlers keep working.
3. Syntax errors fail the start with line and column in the instance's error, instead of showing
   up only in the log. Runtime errors carry the script's line.
4. `nexus.set` for a name without a sensor is remembered for sensors added later, instead of being
   dropped silently. Invalid names and values throw a `TypeError`.
5. An endless loop at the top level fails the start instead of hanging the worker.
6. A throwing callback or an unhandled rejection is logged instead of crashing the worker.
7. `nexus.on` returns a function to remove the handler, handlers may be `async`, and a failing
   handler fails the actuator's command.
8. New: `nexus.store`, the catalog, the panel, typed sensors and actuators.
9. Removed: `require` (for `net` and `crypto`), `Buffer` and `setImmediate`. Use `fetch` and
   Web Crypto (`crypto.subtle`, `crypto.randomUUID()`).
10. The code lives in the instance config and is edited in the instance form, instead of custom
    routes and a separate editor.

## Development

```
npm test                                     # from the repo root; tests live next to the code in src/
npm run build -w @lox-nexus/plugin-script    # dist/plugin.js, one ESM bundle (esbuild)
```
