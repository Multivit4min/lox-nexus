# Concepts

A short vocabulary. The other pages use these words.

| Concept | What it is |
|---|---|
| **Signal** | A named, typed stream of values on the bus. Every Miniserver packet you configure and every sensor or actuator of a plugin is a signal. |
| **Topic** | The readable address of a signal, built from slugs. |
| **Message** | One event on the bus: a value change, a command, the result of a command, or a force or release. |
| **Wire** | A connection from one signal to another, with optional transforms in between. |
| **Force** | A pin on a topic: everyone sees the forced value until you release it. |
| **Miniserver** | A Loxone Miniserver you exchange values with. |
| **Plugin** | Code that connects one kind of external system. You configure one or more **instances** of it. |
| **Sensor / Actuator** | A value coming from a device (sensor), a command going to a device (actuator). |
| **Catalog** | A tree a plugin offers to add many sensors and actuators in a few clicks. |
| **Panel** | A status view of a plugin instance. |

## Signals and topics

Values have one of these types: `null`, `boolean`, `number`, `string`, `singleChannel`, `rgbw`,
`tunableWhite` and `t5` (see [Values](../plugins/values.md)). Topics look like this:

```
loxone/haus/in/licht-kueche                       values from the Miniserver "haus"
loxone/haus/out/pv-leistung                       values to the Miniserver
loxone/haus/discovered/abc123                     unknown packet ids that arrived
homeassistant/zuhause/sensor/kitchen-temp         a sensor of the plugin instance "zuhause"
homeassistant/zuhause/actuator/kitchen-light      a command to a device
system/plugin/zuhause/status                      health of a plugin instance
system/loxone/haus/status                         health of a Miniserver
```

The parts come from slugs (lowercase letters, digits, `.`, `_`, `-`) that you choose. Renaming
something changes its topics; wires and signals refer to internal IDs, so they keep working.

## Wires and transforms

A wire carries values from a source signal to a target signal. Transforms change the value on the
way. Each target can be fed by one wire. See [Wires](wires.md).

## Forces

A force pins a topic to a value. While a topic is forced, every subscriber sees the forced value;
real values keep arriving and are recorded as *shadowed*, so you see what would have happened.
Forcing a Miniserver **out** topic sends the forced value to the Miniserver. Forcing an **in** topic
means everything wired to it sees the forced value. A force can expire at a time you choose, and
survives restarts. Use it to test a wiring or to hold a value during maintenance.

## The Bus Inspector

The **Bus Inspector** shows every message live, with filters by topic and source. Click a message to
see its cause: the command from a wire, the plugin work it triggered and the result with its
duration. You can force, release and inject a value from there.

## The Miniserver and ICI

Nexus speaks Loxone's **Network Intercommunication** (ICI), a UDP protocol. Nexus appears to the
Miniserver as another Miniserver with its own ID. Each value has a **packet ID** and a data type.
See [Setting up a Miniserver](loxone.md).

## Plugins, instances, sensors and actuators

A plugin is code; an **instance** is that code configured once (for example one Home Assistant
server). Each instance runs in its own worker thread, so one that crashes or hangs is restarted
without affecting anything else. An instance is `stopped`, `starting`, `running`, `degraded` (it
runs but reports a problem), `error` (it refused to start, for example with wrong credentials; not
restarted automatically) or `crashed` (restarted with a growing delay, 1 s up to 5 min).

Inside an instance you add **sensors** (values from the device, the source of wires) and
**actuators** (commands to the device, the target of wires). The **catalog**, if the plugin offers
one, lists what the device has, so you add them without typing entity names; search it, and show
only sensors or only actuators when it has both. The **panel** shows
the plugin's own status.

Secret settings such as tokens are never sent back to the browser, and an update that leaves them
out keeps the stored value.

Plugins are trusted code, not sandboxed. Only install plugins you trust. See
[Publishing a plugin](../plugins/publishing.md#trust).
