# MQTT plugin

Connects Nexus to one **MQTT broker** (Mosquitto, EMQX, HiveMQ, Home Assistant's add-on, …) in both
directions:

- **Sensors** read topics into Nexus: a number, on/off or text, from the payload or from a JSON
  path inside it.
- **Actuators** publish to topics: text, a number, on/off words, or the value as JSON.
- The **catalog** browses the topics the broker has and offers them as ready-made sensors.
- The **export** publishes the values of the signals you choose on the instance's page, retained,
  optionally with **Home Assistant MQTT discovery**.

One instance talks to one broker. Add more instances for more brokers.

## Config

| Field (form label) | Default | |
|---|---|---|
| `url` (*Broker URL*) | required | The scheme picks the transport: `mqtt://host:1883`, `mqtts://host:8883` (TLS), `ws://host:9001/mqtt` or `wss://…` (MQTT over WebSocket; include the path the broker serves, MQTT.js uses `/` otherwise). Without a port: 1883, 8883, 80 or 443. No user or password in the URL. |
| `username` (*User*) | none | Leave empty when the broker allows anonymous clients. |
| `password` (*Password*) | none | **Secret**: never sent back to the UI, never logged, never in the panel. |
| `clientId` (*Client ID*) | `lox-nexus-<instance>-<random>` | Made once and kept in the instance's store, so the broker's logs show the same client after a restart. Two clients with the same ID throw each other off the broker (each connect disconnects the other), so never give two instances, or a Nexus and a copy of it, the same ID. Visible ASCII, at most 128 characters. |
| `rejectUnauthorized` (*Check TLS certificate*) | on | `mqtts` and `wss`: refuse a broker whose certificate isn't valid for its name. Turn off only for a broker with a self-signed certificate on your own network; then anyone who can intercept the connection can read the password. |
| `baseTopic` (*Export base topic*) | `lox-nexus` | Exported values go to `<base>/<signal topic>`, the online status to `<base>/status`. Give each Nexus, and each exporting instance on one broker, its own. No wildcards, no leading or trailing `/`, not starting with `$`. |
| `onlineStatus` (*Online status*) | on | Publish `online` (retained) to `<base>/status` after each connect and `offline` at stop; the broker sends `offline` by itself (last will) when Nexus goes away without saying goodbye. |
| `discovery` (*Home Assistant discovery*) | off | Announce the exported signals to Home Assistant; see below. |
| `discoveryPrefix` (*Discovery prefix*) | `homeassistant` | Home Assistant's discovery prefix (its default is `homeassistant`). |
| `browseFilter` (*Browse topics*) | `#` | What the catalog shows, as an MQTT filter: `#` for everything, `zigbee2mqtt/#` for one bridge, `home/+/temperature`. `$SYS` topics need a filter of their own (`$SYS/#`). |
| `browseLimit` (*Browse limit (topics)*) | `1000` | 100 to 5000 topics kept while browsing; the one heard of longest ago is dropped first. |

### Connecting

The plugin speaks MQTT 3.1.1 with a clean session and a 30 s keep-alive.

- **Start.** The start waits up to 5 s for the broker. A **refused login** (wrong user or password,
  not authorized), a **refused client ID** or an **invalid TLS certificate** fails the start: the
  instance shows the error and is not restarted, fix the config. A broker that is **unreachable**
  (refused, timed out, host not found) doesn't fail the start: the instance runs as *degraded* with
  the reason and keeps trying.
- **Reconnecting.** After a lost connection the plugin waits 1 s, 2 s, 4 s … up to 60 s between
  attempts, back to 1 s after a success. While disconnected the status is *degraded*
  ("disconnected: the broker closed the connection; retrying in 4 s"); it is *running* again once
  connected. A failure is logged when its reason changes, not on every attempt. A login refused
  after the start (a changed password) is retried every 60 s.
- After every connect the plugin subscribes to everything its signals need again, and publishes
  the export again (see below).

## Sensors

All three read one **exact topic** (no wildcards: a value signal has one source). The topic names
a new signal. Retained messages arrive when the topic is subscribed and are handled like any other
message, so a signal has its value right away. Several signals on one topic share one subscription;
a signal added to a topic that is already subscribed gets the last message at once.

| Param (form label) | Default | |
|---|---|---|
| `topic` (*Topic*) | required | e.g. `zigbee2mqtt/kitchen/sensor`. At most 1024 characters. |
| `read` (*Payload*) | `text` | *The value itself (plain text)* (`text`) or *JSON* (`json`). |
| `path` (*JSON path*) | empty | For JSON: where the value sits, `temperature`, `state.values[0]` or `values.0`; empty for the whole payload. Names reaching the prototype (`__proto__`) are refused. |

| Sensor | Value type | Reads |
|---|---|---|
| `number` (*Number*) | `number` | JSON numbers; text strictly as a number: `21.5`, `-3`, `1e3`, `21,5` (decimal comma); JSON `true`/`false` as 1/0. |
| `switch` (*Switch (on/off)*) | `boolean` | JSON booleans; numbers (on when not 0); the words `on`/`off`, `true`/`false`, `yes`/`no`, `1`/`0`, `open`/`closed`, in any case, spaces around ignored. |
| `text` (*Text*) | `string` | The payload as it is (an empty payload is the empty text); from JSON, strings, numbers and booleans as text, objects and arrays as their JSON. At most 4096 characters. |

**A payload that doesn't fit** (`abc` for a number, invalid JSON, a missing path, an empty payload
for a number, over 256 KiB) puts the signal into the error state with the reason, for example
`JSON t: "warm" is not a number`, instead of sending a made-up value. The next good message clears
it. The same problem again is reported once.

A subscription the broker refuses (an ACL) puts the signals on that topic into the error state:
"the broker refused the subscription (is this user allowed to read the topic?)".

Removing the last signal of a topic unsubscribes it.

## Actuators

All four publish to one **exact topic** (it names a new signal), only while connected.

| Param (form label) | Default | |
|---|---|---|
| `topic` (*Topic*) | required | e.g. `zigbee2mqtt/kitchen/plug/set` |
| `retain` (*Retain*) | off | The broker keeps the last message for new subscribers. For states, not for commands. A retained empty message (a `text` actuator given an empty or null value) deletes the retained message instead. |
| `qos` (*QoS*) | `0` | `0` at most once, `1` at least once, `2` exactly once. With 1 and 2 a command succeeds once the broker confirmed it. |
| `on`, `off` (*Payload for on/off*) | `ON`, `OFF` | `switch` only. |

| Actuator | Accepts | Publishes |
|---|---|---|
| `text` (*Text*) | any | Strings as they are, numbers as `21.5`, booleans as `true`/`false`, null as an empty payload, structured values as their JSON object (below). |
| `number` (*Number*) | `number` | The number as text, `21.5`. Other values are converted to a number first (`true` is `1`). |
| `switch` (*Switch (on/off)*) | `boolean` | The `on` or `off` words. Other values are converted to on/off first. |
| `json` (*Value as JSON*) | any | The whole value with its type: `{"type":"number","value":21.5}`, `{"type":"rgbw","value":{…}}`, `{"type":"null"}`. |

Structured values are JSON objects, never display text:

| Value type | `text` payload |
|---|---|
| `singleChannel` | `{"channel":50,"fadeTime":0.2}` |
| `tunableWhite` | `{"temperature":2700,"brightness":80,"fadeTime":0.2}` |
| `rgbw` | `{"red":100,"green":50,"blue":0,"white":10,"fadeTime":1,"flags":0}` |
| `t5` | `{"buttons":3}` |

Channels and brightness are percent (0-100), `fadeTime` seconds, `temperature` Kelvin.

**While the broker is unreachable** a command fails at once with the reason ("not connected to the
broker: connection refused …"). Commands are not queued: a light switching minutes later, when the
broker is back, would surprise more than a failed command, and a queue for an offline broker grows
without limit. A command the broker doesn't confirm (QoS 1 and 2) fails after 10 s. Actuators keep
only the newest waiting command while one is being published (`latest`), so a dimmer dragged
across its range doesn't queue hundreds of messages.

## Catalog

The catalog shows the topics the broker has, as a tree of their levels:
`home/kitchen/temperature` is the entry *temperature* under home › kitchen. Each entry is a
ready-made sensor with a guessed reader and the last value:

- a number (`21.5`) → `number`; an on/off word (`ON`, `false`) → `switch`; anything else → `text`
  (the first 200 characters shown);
- a JSON object → a node of its own with a `text` entry for the whole payload and an entry per
  field (numbers, booleans, on/off words, text; nested objects as `battery.level`, three levels
  deep, 20 fields at most). Arrays and keys a path can't name are left out of the fields.

It's a guess: change the sensor or its params after adding it.

**Subscribed only while you browse.** The first request subscribes to `browseFilter` and collects
for up to 3 s (until no message came for 0.5 s; retained messages come at once). Further requests
within two minutes show what arrived since. Two minutes after the last request the plugin
unsubscribes and forgets the topics. At most `browseLimit` topics are kept, each with the first
1024 characters of its last payload; an empty retained message removes a topic. At most 20 000
entries are shown; narrow the filter for more.

Only sensors are offered: a topic says nothing about where commands go (zigbee2mqtt takes them on
`…/set`, Tasmota on `cmnd/…`). Add actuators by hand.

## Export

**Choose the signals on the instance's page** (*Exported signals*): all, whole Miniservers or
plugin instances, or single signals. Any signal can be exported: Loxone inputs and outputs, other
plugins' sensors and actuators. Until you choose, nothing is published.

Each value is published **retained** (QoS 0) to `<base topic>/<signal topic>`, e.g.
`lox-nexus/loxone/home/in/temperature`:

| Value type | Payload |
|---|---|
| `number` | `21.5` |
| `boolean` | `true` or `false` |
| `string` | the text as it is |
| `singleChannel`, `tunableWhite`, `rgbw`, `t5` | the JSON object, as for the `text` actuator |
| `null` | not published (counted as skipped) |

`+`, `#` and NUL in a signal topic become `_`; empty levels are left out. The current value of
each signal is published when watching starts, then every change (commands to actuators and forced
values too).

- **After every connect** the last value of each exported signal is published again, so a broker
  that lost its retained messages (a restart without persistence) is complete again. While
  disconnected nothing is sent; only the last value of each signal is kept.
- **A signal no longer exported** (left out, renamed, moved to another base topic) has its retained
  value removed (an empty retained message), so nothing stale stays on the broker. A signal whose
  topic changes (renamed, or its Miniserver renamed) takes its last value to the new topic at once.
  A signal chosen again is announced to Home Assistant again. The plugin
  remembers in its store which topics it used, so this also works across restarts; removals that
  couldn't be sent yet are kept for the next connect.
- Publishing waits for the socket, so a slow broker slows the delivery; Nexus then drops the
  oldest values before they reach the plugin (*Dropped by Nexus* in the panel).

### Online status and last will

With `onlineStatus` on, `<base>/status` is `online` (retained) after each connect and `offline` at
stop. The connection carries a **last will** of `offline` (retained, QoS 1), which the broker
publishes when Nexus vanishes without a clean disconnect (a crash, a lost network, a pulled plug).
Turning `onlineStatus` off later leaves the last retained `online` or `offline` on `<base>/status`;
remove it with any MQTT client (publish an empty retained message there) if something still reads it.

### Home Assistant discovery

With `discovery` on, each exported signal gets a retained config under
`<discovery prefix>/<component>/lox_nexus_<instance id>/<signal id>/config`:

- `binary_sensor` for on/off signals (`payload_on: "true"`, `payload_off: "false"`),
- `sensor` for the rest: numbers with `state_class: measurement`; text as it is; structured values
  with a state template (dimmer channel or brightness in %, the brightest RGBW channel, the T5
  buttons) and the whole JSON as attributes.

```json
{
  "name": "Living room",
  "unique_id": "lox_nexus_<instance id>_<signal id>",
  "state_topic": "lox-nexus/loxone/home/in/temperature",
  "device": { "identifiers": ["lox_nexus_<instance id>"], "name": "Lox Nexus <instance>", "manufacturer": "Lox Nexus", "model": "MQTT export" },
  "origin": { "name": "Lox Nexus" },
  "availability_topic": "lox-nexus/status",
  "payload_available": "online",
  "payload_not_available": "offline",
  "state_class": "measurement"
}
```

All exported signals belong to one device per plugin instance. The `unique_id` comes from the
instance and the signal id, so renaming a signal renames the entity instead of making a new one.
Without `onlineStatus` the configs have no availability. The entities are **read-only**: to switch
something in Nexus from Home Assistant, publish to a topic a sensor of this plugin reads.

Configs are sent again after every connect and when a signal changes (a rename); a signal no longer
exported, or all of them when discovery is turned off, get an empty retained config, which removes
the entity from Home Assistant.

## Panel

Three sections. **Connection**: state (connected since, or the next attempt), the broker (scheme,
host, port, path: never the password), client ID, user, the last error, messages received and
published (and failed publishes), subscriptions (and the topics sensors read). **Browsing**:
whether the browse filter is subscribed now, the topics kept (of the limit), and how many were
dropped at the limit. **Export**: watched signals, the base topic, discovery, values published,
the last publish, failed and skipped values, values dropped by Nexus, and retained topics removed
(and still waiting). The counters live in memory and start at zero with every start.

## Security notes

- The **password** is a secret config field: never sent back to the UI, never logged, never in the
  panel. User and password in the URL are refused, so they can't show up where the URL does.
- Over `mqtt://` and `ws://` the password and every message travel **unencrypted**. Use `mqtts://`
  or `wss://` for a broker that isn't on the same host or a trusted network, and keep *Check TLS
  certificate* on.
- Give the plugin its **own broker user** with an ACL: read on the topics its sensors and the
  catalog need, write on its actuator topics, `<base topic>/#` and the discovery prefix.
- **The export publishes the values of other systems**, for example alarm states or presence, to
  everyone who may read those topics on the broker. Choose only what you want there. Secrets never
  travel on the bus.
- Anyone who can publish to a topic a sensor reads controls that signal, and through wires maybe
  your Loxone outputs. Protect those topics on the broker.

## Fixed compared to the old integration

1. It subscribed to `#` all the time. Now sensors subscribe exactly their topics, and the catalog
   subscribes its filter only while you browse.
2. It kept the last message of every topic forever (a declared 5-minute expiry was never used). Now
   the router keeps one message per topic a signal reads, and the catalog at most `browseLimit`
   topics with clipped payloads, forgotten two minutes after browsing.
3. `subscribe_json` wrote the whole message to the database on every message. Nothing is written
   per message now.
4. Its start cleared every variable's stored state. Nothing is cleared now; the store only keeps
   the client ID and the export's topics.
5. `client.end()` wasn't awaited. Now a stop publishes `offline`, sends a clean DISCONNECT and waits
   for it, at most 1.5 s, then closes the socket.
6. Topic names were decoded twice in an HTTP route. There is no such route now; topics are params.
7. Structured values were published as display text (`"50% 0.2s"`, `"#RRGGBBWW 0.2s"`,
   `"4000K 50% 0.2s"`). Now they are JSON.
8. Publishing while offline queued in MQTT.js without a limit, and payloads that didn't parse
   became garbage values. Now commands fail at once, and unreadable payloads are signal errors.

Also new: typed number, switch and text sensors with JSON paths, retain and QoS per actuator, the
catalog, the export with Home Assistant discovery, the last will, and reconnecting with backoff.

## Limits

- MQTT 3.1.1 only (every broker speaks it); no MQTT 5 properties.
- No custom CA certificate or client certificates yet: for a self-signed broker certificate, turn
  off *Check TLS certificate*.
- MQTT 3.1.1 has no maximum packet size, so a very large message on a subscribed topic is received
  whole before the plugin refuses it (sensors read at most 256 KiB, the catalog keeps 1024
  characters). The worker has a 128 MB heap; don't browse topics that carry camera images.
- Sensor topics are exact; a wildcard sensor (one signal for many topics) isn't offered.
- Home Assistant shows at most 255 characters of a sensor's state; longer exported text is refused
  there.
- The plugin store is limited to 1 MiB; with many thousands of exported signals the list of their
  topics may not fit, and removals after a restart are then missed (a warning is logged).

## Development

```
npm test                                   # from the repo root; tests live next to the code in src/
npm run build -w @lox-nexus/plugin-mqtt    # dist/plugin.js, one ESM bundle (esbuild)
```

Tests run against an in-process broker (aedes on 127.0.0.1, port 0, TCP or WebSocket;
`src/test-support/TestBroker.ts`) and a broker that never answers
(`src/test-support/SilentBroker.ts`); no real broker is contacted. MQTT.js is CommonJS, so the
build adds a `createRequire` banner for its `require()` calls of Node built-ins.
