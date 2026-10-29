# MQTT plugin

Connects Nexus to one MQTT broker (Mosquitto, EMQX, HiveMQ, the Home Assistant add-on, …) in both
directions: sensors read topics into Nexus, actuators publish to topics, and the export publishes
the values of signals you choose. One instance talks to one broker; add more instances for more
brokers.

## What it does

- **Sensors:** a number, on/off or text from each message on one exact topic, read from the plain
  payload or from a path inside a JSON payload.
- **Actuators:** publish text, a number, on/off words or the whole value as JSON to one exact
  topic, with retain and QoS per actuator.
- **Catalog:** the topics the broker has, as a tree of their levels, each offered as a ready-made
  sensor with a guessed type and its last value.
- **Panel:** the connection (state, broker, client ID, last error, message counters), the browsing
  cache, and the export counters.
- **Export:** the values of the signals chosen on the instance's page, published retained to
  `<base topic>/<signal topic>`, optionally announced to Home Assistant by MQTT discovery.

## Before you start

- An MQTT broker that speaks MQTT 3.1.1 (every common broker does), reachable from Nexus over TCP
  (`mqtt://`, `mqtts://`) or WebSocket (`ws://`, `wss://`).
- Ideally a broker user of its own for this plugin, with read access to the topics its sensors and
  the catalog need, and write access to its actuator topics, the export base topic and the
  discovery prefix.
- For TLS with a self-signed certificate: custom CA certificates aren't supported yet, so you have
  to turn off **Check TLS certificate**.
- For Home Assistant discovery: the MQTT integration set up in Home Assistant, on the same broker.

## Configuration

| Field | | Description |
|---|---|---|
| **Broker URL** (`url`) | required | The broker. The scheme picks the transport: `mqtt://broker.local:1883`, `mqtts://broker.local:8883` (TLS), `ws://broker.local:9001/mqtt` or `wss://…` (WebSocket; include the path the broker serves). Without a port: 1883, 8883, 80 or 443. User and password in the URL are refused. |
| **User** (`username`) | optional | The broker user, e.g. `nexus`. Leave empty when the broker allows anonymous clients. |
| **Password** (`password`) | optional; secret | The user's password. Never shown again, logged or put in the panel. |
| **Client ID** (`clientId`) | optional; default `lox-nexus-<instance>-<random>` | The MQTT client ID, e.g. `lox-nexus-home`. Leave empty: the plugin makes one and keeps it across restarts. Visible ASCII without spaces, at most 128 characters. Never give two clients the same ID. |
| **Check TLS certificate** (`rejectUnauthorized`) | optional; default on | For `mqtts` and `wss`: refuse a broker whose certificate isn't valid for its name. Turn off only for a self-signed certificate on your own network. |
| **Export base topic** (`baseTopic`) | optional; default `lox-nexus` | Exported values go to `<base topic>/<signal topic>`, the online status to `<base topic>/status`. Give each Nexus and each exporting instance on one broker its own, e.g. `lox-nexus-home`. No wildcards, no leading or trailing `/`, not starting with `$`. |
| **Online status** (`onlineStatus`) | optional; default on | Publish `online` (retained) to `<base topic>/status` after each connect and `offline` at stop; the broker publishes `offline` by itself (last will) when Nexus disappears. |
| **Home Assistant discovery** (`discovery`) | optional; default off | Announce the exported signals to Home Assistant as read-only sensors and binary sensors. |
| **Discovery prefix** (`discoveryPrefix`) | optional; default `homeassistant` | Home Assistant's MQTT discovery prefix. Change it only if you changed it in Home Assistant. Same rules as the base topic. |
| **Browse topics** (`browseFilter`) | optional; default `#` | What the catalog shows, as an MQTT filter: `#` for everything, `zigbee2mqtt/#` for one bridge, `home/+/temperature`. `$SYS` topics need a filter of their own (`$SYS/#`). Subscribed only while you browse. |
| **Browse limit (topics)** (`browseLimit`) | optional; default `1000` | How many topics the catalog keeps while browsing, 100 to 5000; the one heard of longest ago is dropped first. |

## Sensors and actuators

| Kind | Name (id) | Value | What it is |
|---|---|---|---|
| sensor | Number (`number`) | `number` | A number from each message on a topic, e.g. a temperature; text, decimal comma or JSON. |
| sensor | Switch (on/off) (`switch`) | `boolean` | On or off from each message, e.g. `ON`/`OFF` of a plug, `true`/`false`, `1`/`0`. |
| sensor | Text (`text`) | `string` | The text of each message, or a part of a JSON message. |
| actuator | Text (`text`) | any | Publishes the value as text: `21.5`, `true`, a string as it is, colours and dimmer values as JSON. |
| actuator | Number (`number`) | `number` | Publishes a number, e.g. a set point or a dimmer level. |
| actuator | Switch (on/off) (`switch`) | `boolean` | Publishes `ON` or `OFF`, or words you choose, e.g. to switch a plug. |
| actuator | Value as JSON (`json`) | any | Publishes the whole value with its type, e.g. `{"type":"number","value":21.5}`. |

## Good to know

- Sensor and actuator topics are exact: no `+` or `#`. Retained messages arrive at once, so a
  sensor has its value right after it is added.
- A payload that doesn't fit the sensor (`abc` for a number, invalid JSON, a missing JSON path)
  puts the signal into the error state with the reason; it never sends a made-up value. The next
  good message clears it.
- While the broker is unreachable, commands fail at once; they are not queued. A wrong user,
  password or client ID, or an invalid TLS certificate, stops the instance at start; an
  unreachable broker only makes it degraded, and it keeps retrying.
- The catalog offers sensors only (a topic doesn't say where its commands go, e.g. `…/set` or
  `cmnd/…`): add actuators by hand. It subscribes only while you browse.
- Over `mqtt://` and `ws://` the password and all messages travel unencrypted. The export
  publishes the values you choose to everyone allowed to read those topics on the broker.

## More

The full reference (sensor and actuator params, payload formats, connecting and reconnecting, the
catalog, the export with online status and Home Assistant discovery, the panel, limits, security
notes, development notes, and what was fixed compared to the old integration) is in `REFERENCE.md`
next to this file, and on the plugin's page in the Nexus documentation.
