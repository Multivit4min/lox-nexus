# 0013: Plugins can watch signals the user chooses; the host filters and paces delivery

## Context
Exporters (InfluxDB first, later MQTT, Prometheus, CSV) need the values of many signals of other
systems. Plugins so far only see what is wired to their actuators, one wire per target, which
doesn't scale to "every temperature of the house" and would make exports act as commands.

## Decision
- A plugin declares `static readonly watches = { label, description }` and implements
  `watched(values, dropped)`. Its description carries `watches`, so the UI and the install review
  know.
- The user chooses, per instance, which signals it receives, with the same selection model as the
  history (ADR 0012): all or selected, rules on signals, Miniservers and plugin instances. The host
  filters; a plugin never asks for topics itself, so it can't get more than granted, and its config
  says only how it exports.
- New wire messages, additions within wire version 1: host → worker `watch.signals` (the full list,
  resent on change) and `watch.values` (batches with a sequence number and a `dropped` count);
  worker → host `watch.ack`. They are sent only to plugins whose description declares `watches`, so
  older plugins never see them; older hosts never send them.
- The host sends a value at once while fewer than two batches wait for an ack, else gathers up to a
  thousand per batch. At most 20 000 values wait per instance; beyond that the oldest are dropped and
  counted. The worker calls `watched()` one batch at a time and acks when it settles, also after a
  throw.

## Consequences
- A slow exporter slows its own feed and loses the oldest values under sustained overload; it never
  slows the bus or grows the host's memory without bound, and its worker holds at most two batches.
- Watching plugins see values of other systems. Plugins are trusted code already (ADR 0001); the
  install review and the instance page say what watching means.
- The selection model has two kinds of consumers now: "history" and plugin instance ids. A deleted
  instance's choice goes with it; only the history's choice travels with the config export so far
  (plugin instances aren't exported yet).
- The queue bound counts values, not bytes: bus values are bounded by their producers (texts of a
  few KB at most). When values are dropped, the instance's error topic says so at most once a
  minute, since a hung plugin can't.
