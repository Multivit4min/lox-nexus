# 0018: Plugin signals are grouped by params the plugin marks, derived in the UI

Status: **Accepted** (2026-10-29), from the Matter MB1 review; built in MB1.

## Context

An instance's signal list is flat. Several plugins produce many signals per device: the Matter
bridge (per device, commands in and state out, so 2–8 signals), Home Assistant (state, attributes
and service actuators per entity), the future Matter controller (node and endpoint). Users want
the signals of one device together, and collapsible.

Considered:
- **A static `group(params)` on capability classes.** The host never runs plugin code, so the
  grouping would be unknown while an instance is stopped.
- **A group field on catalog entries, stored per signal.** This needs a migration, DTO and form
  changes, does nothing for existing or manually added signals, and goes stale when a device is
  renamed.
- **A user-edited group per signal.** This is a cross-cutting "rooms/tags" feature that should
  also cover Loxone signals. It is a separate design.
- **One row per sensor and actuator pair.** A pair is two signals with their own topics, wires,
  forces and history. Merging them would break selection, bridging and recording, which all act
  on single signals.

## Decision

- The SDK gets `signalGroup(schema)`, next to `signalName()`: it marks a top-level param as
  identifying the device. In the description it appears as `signalGroup: true` in the JSON
  Schema.
- The web derives the group from the stored params: the values of the marked params of the
  signal's capability, in declaration order, joined with " ▸ ". Nothing is stored. The server, the
  core and the wire protocol are unchanged.
- `PluginSignalsCard` shows a header row per group: label, count, a checkbox that selects the
  group, and a toggle that collapses it. Collapsed state is per page view only. Signals without a
  marked param, and groups with a single signal, are shown as plain rows. Search filters signals
  first; a group shows when any of its signals matches.
- The Matter bridge marks its `device` param. The controller marks `node` and `endpoint`. Home
  Assistant marks `entityId`.

## Consequences

- Grouping works at once for existing signals of plugins that mark a param, and for stopped
  instances. Wires, history, export, backup and config transfer are untouched.
- Group labels are raw param values (`light.kitchen`, a Matter node id), not friendly names.
  Plugins whose device isn't a param of its own (Fronius dot paths, MQTT topics) aren't grouped;
  changing their params would break existing signals.
- Old hosts and web builds ignore the marker.
