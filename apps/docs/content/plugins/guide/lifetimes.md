# Lifetimes: `Disposable`

Read this before you start a timer or listen to an event. It also covers the clock and the time zone.

Plugins, sensors and actuators all extend `Disposable`. It exists so nothing outlives its owner:
when a signal is removed or the instance stops, every timer, listener and child you registered
through it is released, and you write no cleanup code.

```ts
export class MyPlugin extends Plugin<Config> {
  readonly client = this.own(new Client(this.config.host))         // closed when the plugin stops

  override start() {
    this.every(60_000, () => void this.client.refresh())           // repeating timer
    this.after(5_000, () => this.log.info("5 s after start"))      // one-shot timer
    this.listen(this.client, "disconnect", () => this.onGone())    // an EventEmitter event
    this.onDispose(() => this.log.info("stopped"))                 // anything else
  }
}
```

These methods are `protected`: only the owner decides what lives and dies with it.

| Method | What it does |
|---|---|
| `this.own(resource)` | Disposes a child (a client, a poller, a socket wrapper) with this object, and returns it, so construction and registration fit in one expression. The child needs a `dispose()` (a `DisposableLike`). |
| `this.every(ms, fn)` | Repeating timer. The first run is after `ms`, not at once. Returns a cancel function. Throws `RangeError` unless `0 < ms <= Disposable.MAX_TIMER_MS` (about 24.8 days). |
| `this.after(ms, fn)` | One-shot timer. Returns a cancel function. Throws `RangeError` for a negative or non-finite `ms`. Longer delays are stepped, so they don't fire early. Calling it again and again (a restarted pulse) does not pile anything up. |
| `this.listen(emitter, event, listener)` | Subscribes to an `EventEmitter` (anything with `on` and `off`) and unsubscribes on dispose, so a long-lived emitter does not keep a dead sensor alive. |
| `this.onDispose(teardown)` | Your own cleanup: close a socket, flush a buffer. May be async. |
| `dispose()` | Releases everything. You rarely call it: Nexus disposes plugins, sensors and actuators, and `own()` disposes children. |
| `isDisposed` | `true` from the moment `dispose()` starts. Check it in a callback that can arrive late. |

Rules that follow from this:

- **Never use bare `setInterval`, `setTimeout` or `emitter.on`** in a long-lived class, or stop
  leaves things running.
- **Registering after dispose throws** (`Error`), so a late callback cannot leak a timer into a dead
  object.
- **Teardowns run in reverse registration order**, and an async teardown is awaited before the next
  one starts. If one fails, the others still run, and `dispose()` then throws an `AggregateError`
  collecting the errors. A second `dispose()` returns the same promise.
- **Stop order.** Sensors and actuators are disposed first, then the plugin (so a plugin's `own()`
  children, such as a poller, are still alive while signals shut down). The whole stop, a running
  `watched()` included, has 5 seconds; then the worker is terminated, so keep a last flush on
  dispose shorter than that (the InfluxDB plugin gives its last write 3 seconds).
- **An exception thrown inside a timer or listener callback is an uncaught exception.** It ends the
  worker and Nexus restarts it. Catch errors inside the callback and report them with `this.log`
  or `this.status`. A callback that returns a rejected promise goes to `unhandledRejection()`.
- `every()` does not wait for a slow callback: a long async `fn` can overlap its next run, so
  guard it yourself (a `polling` flag) if it matters.

Any class you own can be a `Disposable` itself, which gives it the same helpers. It inherits the
plugin's clock once owned.

## Time and time zones

Two things about time are easy to get wrong in a worker.

**Use `this.clock.now()` instead of `Date.now()`** (and `new Date(this.clock.now())` for a `Date`).
`every()` and `after()` run on the same clock. In production it is the system clock; in tests it can
be a [`TestClock`](../testing.md#time) you move by hand. Plugins, sensors and actuators have
`this.clock`. Other classes you `own()` (a poller, a client) inherit the plugin's clock for their
timers and read the time with `this.currentClock().now()`. A child that starts a timer in its own
constructor, before it is owned, stays on the system clock, so start timers in `start()` or later.

**Use `this.timeZone` for the local time.** The worker runs in the Nexus process's time zone, which
in a container is usually UTC. `this.timeZone` is the IANA zone of the installation (for example
`"Europe/Vienna"`), which Nexus takes from the Loxone project, or the server's zone while it has
none. Pass it to `Intl.DateTimeFormat` and friends. An unknown zone falls back to the server's
zone; it never throws. A time-based plugin can still offer its own `timeZone` setting that overrides
it, as the [Calendar plugin](../calendar.md) does.

```ts
const local = new Intl.DateTimeFormat("en-GB", { timeZone: this.timeZone, hour: "2-digit", minute: "2-digit" })
  .format(this.clock.now())
```

`after()` and `every()` count elapsed time, not wall-clock time, so a clock step (an NTP sync after
boot) is not noticed. For a deadline given as a wall-clock time, wait in shorter slices (the
Calendar plugin caps its waits at 15 minutes) and re-check `this.clock.now()` each time.
