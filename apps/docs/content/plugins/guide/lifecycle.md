# The lifecycle of a plugin

Read this when you wonder where a piece of code belongs, or why something runs again.

Knowing the order of events tells you where code belongs. This is what your plugin sees, from the
user adding an instance to it being stopped.

## 1. Start of a run

1. **The worker starts** with an empty environment (`process.env` is empty) and a 128 MB heap
   limit (or the manifest's `heapMb`, up to 512). Nexus waits up to 10 seconds for the entry module to announce itself, which
   `PluginEntry.define()` does.
2. **Nexus sends the instance**: its id, slug, settings, the persisted store and the installation's
   time zone. The runtime checks your static declarations first (a sensor without `id`, or two
   sensors with the same `id`, fail the start with a clear message).
3. **The config is validated** against your static `config` schema, defaults applied. Invalid
   settings fail the start with `invalid config: …` and your code is not run.
4. **Your constructor and field initializers run.** `this.config`, `this.log`, `this.store`,
   `this.status`, `this.http`, `this.slug`, `this.timeZone` and `this.clock` are ready, so a field
   like `readonly api = new Api(this.config.host)` works.
5. **`start()` is awaited.** It has 30 seconds. Register timers and routes here and kick off first
   requests in the background. If it rejects, the instance goes to the *error* state: what you
   registered is disposed, and Nexus does not restart it, because a restart would fail the same
   way. If it takes longer than 30 seconds, Nexus treats the worker as hung, terminates it and
   restarts it with the delay described under [restarts](failing.md).

## 2. Signals

6. **Every configured signal is added**, one after the other. For each, the runtime validates its
   `params` against the capability's schema, constructs your `Sensor` or `Actuator` (so field
   initializers can use `this.plugin` and `this.params`), and awaits its `start()`. A signal whose
   `start()` throws or whose params are invalid is refused: the message shows on that signal, and
   the others are unaffected.
7. **Forced actuators are replayed.** If the user forced a value on an actuator, Nexus sends it
   again to the freshly started actuator, so `run()` can be called right after `start()` resolves.
8. **A watching plugin gets its list** (`watchChanged()`) and then values. See
   [watching](watching.md).

## 3. While it runs

- **A sensor emits**; the value goes to the bus and from there along the wires.
- **A command arrives** for an actuator: its `run(value)` is called with the value already
  converted to `accepts`. Commands to one actuator never overlap.
- **The user opens the instance page**: `panel()` is called. **The user browses the catalog**:
  `catalog()` is called. **A webhook is called**: your route handler runs.
- **The user adds, edits or removes a signal.** Adding constructs and starts a new sensor or
  actuator. Removing disposes it. **Editing a signal's params disposes the old object and creates
  a new one with the new params**, so `start()` runs again; nothing carries over except what
  lives in your plugin or store.
- **Nexus pings** the worker every 10 seconds. You do nothing for this, but a busy loop that never
  yields stops the answers.
- **The watched signals change**: `watchChanged()` and `watched()` are called.

## 4. Stop, change or crash

- **Stop.** When the user stops the instance, or Nexus shuts down, Nexus asks the worker to shut
  down and gives it **5 seconds**. First a running `watched()` finishes, then all sensors and
  actuators are disposed (their teardowns, then the next), then the plugin itself. Then the worker
  is terminated. Whatever is left after 5 seconds is cut off.
- **New settings or a new plugin version.** A running instance is stopped as above, and started
  again as a **new worker with a new plugin object**: the sequence in this section starts at step 1.
  Memory does not survive; the store does. An instance that was not running stays stopped. A
  changed slug moves the instance's topics; wires keep working because they refer to signals by id.
- **Crash.** If the worker exits, runs out of memory or stops answering pings, Nexus terminates
  it and starts a new one after a delay. Nothing of yours runs at that point (no `dispose()`), so
  you cannot flush on a crash; keep what must survive in the store.

Things you can rely on in every case: `dispose()` runs at most once per object, and a sensor or
actuator is never used after its `dispose()` has begun (`isDisposed` is then `true`).
