# Lox Nexus

Lox Nexus connects other systems to your **Loxone Miniserver**. Home Assistant, a Fronius
inverter, an iCal calendar or anything else you can write a plugin for becomes a set of values
that the Miniserver reads and writes, using Loxone's own **Network Intercommunication** (UDP). The
Miniserver needs no extra hardware, no cloud and no HTTP polling.

## Key ideas

- **Everything is a signal.** A value coming from the Miniserver, a sensor of a plugin and a
  command to a device are all signals on one internal bus, each with a readable topic such as
  `homeassistant/zuhause/sensor/kitchen-temp`.
- **Wires connect signals.** A wire links a source to a target and can invert, scale, map,
  debounce, throttle or convert the value on the way.
- **Plugins talk to the outside world.** Each configured plugin instance runs in its own worker
  thread, so one that crashes or hangs does not affect the rest.
- **You can always see and override what happens.** The Bus Inspector shows every message with
  its cause, and a **force** pins a signal to a value, for testing or maintenance.

## Where to go next

- **Run Nexus:** [Installation](guide/installation.md), then [Concepts](guide/concepts.md) and
  [Setting up a Miniserver](guide/loxone.md).
- **Connect something:** the [Fronius](plugins/fronius.md), [Home Assistant](plugins/homeassistant.md),
  [Calendar](plugins/calendar.md), [Webhook](plugins/webhook.md) and [Script](plugins/script.md)
  plugins ship with Nexus.
- **Keep values:** [History](guide/history.md) charts in Nexus, and the [InfluxDB](plugins/influxdb.md)
  plugin for Grafana and long-term storage.
- **Write a plugin:** start with the [10-minute quick start](plugins/index.md), then read the
  [plugin guide](plugins/authoring.md) and the [SDK reference](reference/sdk/index.md).

## Status

Nexus is under active development. Pages mark what is not available yet, for example installing
plugins from a ZIP file or a git URL, the Docker image and the published SDK package.
