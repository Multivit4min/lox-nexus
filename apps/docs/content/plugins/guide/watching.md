# Watching signals (exporters)

Read this when your plugin should receive values (an exporter) instead of offering them.

Normally a plugin only offers signals. A *watching* plugin does the reverse: it receives the values
of signals the user chooses, Loxone signals, other plugins' sensors and actuators, anything on the
bus. That is how an exporter (InfluxDB, MQTT, a CSV file) works. Declare it and implement `watched()`:

```ts
import { Plugin, type WatchedValue } from "@lox-nexus/plugin-sdk"

export default class InfluxPlugin extends Plugin<InfluxConfig> {
  static readonly watches = { label: "Exported signals", description: "Values of these signals are written to InfluxDB" }

  override async watched(values: readonly WatchedValue[], dropped: number) {
    // oldest first; this.watch.signal(id) has the signal's label, topic, type and owner
    for (const value of values) {
      const signal = this.watch.signal(value.signalId)
      if (signal) this.buffer.add(signal, value)
    }
    if (dropped) this.log.warn(`${dropped} values were dropped while the export was behind`)
  }

  override watchChanged() {
    // optional: this.watch.signals() is the new list (chosen, left out, renamed)
  }
}
```

- **`watches`** is the declaration (`label` 1 to 100 characters, `description` up to 500). Without it
  the plugin is never given values, even if it implements `watched()`.
- **The user decides what the plugin sees**, on the instance's page: all signals or chosen ones,
  whole Miniservers or plugin instances, single signals. The plugin's config says *how* it exports,
  never *what*. Until the user chooses, the plugin gets nothing.
- **`this.watch`** describes the chosen signals: `signals()` is the list and `signal(id)` one entry
  with `id`, `topic`, `label`, `valueType` and `owner`. It is empty until the first list arrives,
  which happens after `start()`. A topic changes when the signal or its owner is renamed.
- **`watchChanged()`** is called first, with the list ready in `this.watch`, then on every change
  (chosen, left out, renamed). It is optional to override.
- **`watched(values, dropped)`** gets batches of up to 1000 values, **oldest first**. The first
  batch holds the current value of each chosen signal (`initial: true`; actuators have none unless
  forced), and a signal added to the choice later also starts with its current value. After that come the changes as the bus shows them: forced values are marked `forced`, and
  commands to actuators have `kind: "command"`. `ts` is epoch milliseconds.
- **Callbacks never overlap**, and a batch always meets the list it was sent with. On shutdown, a
  running `watched()` finishes before the plugin is disposed.
- **Delivery is paced by the plugin.** The next batch comes once `watched()` returns (or its promise
  settles), and Nexus sends at most two batches ahead. While a plugin is slower than the values
  arrive, Nexus keeps a bounded queue (20 000 values) and drops the oldest; `dropped` says how many
  since the last batch. A throw in `watched()` is logged and doesn't stop the feed. Keep your own
  buffer bounded too.
- **Trust.** A watching plugin sees values of other systems, for example alarm states. The install
  review and the instance page say so. Secrets never travel on the bus.
- **Testing.** `host.watchSignals([...])` sets the chosen signals, and `await host.pushValues([...])`
  delivers a batch and resolves when `watched()` finished. See [Testing](../testing.md#watching-signals).
