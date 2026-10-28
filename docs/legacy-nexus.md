# The previous Nexus: export format and unported integrations

The previous implementation lives at github.com/Multivit4min/loxone-nexus (server, commit `53fd946`)
and github.com/Multivit4min/loxone-nexus-frontend (UI, commit `22d9a54`). It is no longer kept in
this repository. File references below (`src/…:line`) point into the server repository at that
commit. This page keeps what the M6 importer and future plugins need from it. Its known bugs that
the rewrite fixed are in `architecture.md` and `loxone-ici-review.md`.

## The v1 export file

Made by `POST /api/export`, read by `POST /api/export/upload` (`src/core/exporter/Exporter.ts`),
both behind the login. Plain JSON with no encryption or compression. **It holds plaintext secrets**
(see "Secrets" below), so treat the file as sensitive.

```json
{
  "type": "drizzle-export",
  "version": 1,
  "date": "2026-01-01T00:00:00.000Z",
  "data": {
    "user": [{ "id": 1, "username": "admin", "password": "$argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>", "createdAt": "2026-01-01 12:00:00" }],
    "loxone": [{ "id": 1, "active": true, "label": "Main", "host": "192.0.2.10", "port": 61263, "listenPort": 40000, "remoteId": "ABCD1234", "ownId": "NEXUS001" }],
    "loxoneVariables": [{ "id": 1, "loxoneId": 1, "label": "Temp", "direction": "INPUT", "packetId": "t0000001",
      "value": { "type": "number", "value": 21.5 }, "suffix": "C", "forced": false, "forcedValue": { "type": "null", "value": null }, "type": 1 }],
    "integration": [{ "id": 1, "label": "HA", "type": "HomeAssistant", "config": { "ws": "wss://ha.example.invalid", "token": "<secret>" }, "store": {} }],
    "integrationVariables": [{ "id": 1, "integrationId": 1, "label": "Light", "direction": "OUTPUT",
      "value": { "type": "null", "value": null }, "config": { "action": "light.set", "entityId": "light.kitchen" }, "store": {} }],
    "links": [{ "id": 1, "loxoneVariableId": 1, "integrationVariableId": 1 }]
  }
}
```

- Every array is a full row dump of its table. Keys are camelCase Drizzle names; JSON columns
  arrive parsed, not as strings. The key `integration` is singular although the table is
  `integrations`.
- **Tolerate what the database could hold.**
  - Columns that may be null: `loxone.active`, `loxone.label`, `loxoneVariables.label`, `loxoneVariables.suffix` (auto-created inputs write null), `integration.label`, `integrationVariables.label`, `value` and `forcedValue`.
  - The old importer's schema refuses some of those nulls, so don't copy it.
- `user.createdAt` is SQLite's `"YYYY-MM-DD HH:MM:SS"` (UTC), not ISO.
- **Ids are per table and must be remapped.** The old importer appended rows and matched children by array index.
- **`links` was exported but never imported** by the old importer.
- The old upload was limited to 100 kB. A Calendar integration's `store` holds a whole parsed ICS file and can exceed that.
- Unknown inbound packets (discovered inputs) lived in memory only and are not in the export.

### Users

- **Password hashes:** argon2 PHC strings from the npm `argon2` package (argon2id by default, `$argon2id$v=19$…`). Nexus hashes with scrypt (ADR 0008), so the importer must either verify argon2 or ask the users to set new passwords (`npm run reset-password`).
- **Sessions:** the old JWT secret was an environment variable, so no session carries over.

### Miniservers and their variables

- **`loxone` (a Miniserver):**
  - `host`: the Miniserver address.
  - `port`: its ICI port (default 61263).
  - `listenPort`: the local UDP port Nexus bound.
  - `ownId`: Nexus's ICI id, the sender id in outgoing packets.
  - `remoteId`: the Miniserver's id, the target id.
  - Both ids are text(8).
- **`loxoneVariables`:**
  - `packetId` (text(8)) is the ICI packet id.
  - `direction` is relative to Nexus:
    - `INPUT`: the Miniserver sends, Nexus receives.
    - `OUTPUT`: Nexus sends to the Miniserver.
  - `suffix` is a unit label for display only.
  - `forced` / `forcedValue` was a per-variable force: the forced value replaced `value` for sending and for links.
  - Receiving a packet overwrote `type` with the packet's type.
- **`type`** is the ICI data type byte:

| Number | Old name | Stored `value` |
|---|---|---|
| 0 | DIGITAL | `{"type":"boolean","value":true}` |
| 1 | ANALOG | `{"type":"number","value":21.5}` (rounded to 5 decimals) |
| 2 | TEXT | `{"type":"string","value":"abc"}` |
| 3 | T5 | always `{"type":"null","value":null}`: the old code couldn't represent or send T5 |
| 4 | SmartActuatorRGBW | `{"type":"SmartActuatorRGBW","value":{"red":0,"green":0,"blue":0,"white":100,"fadeTime":0.2,"bits":0}}` (0–100 %, seconds, `bits` unknown) |
| 5 | SmartActuatorSingleChannel | `{"type":"SmartActuatorSingleChannel","value":{"channel":50,"fadeTime":0.2}}` |
| 6 | SmartActuatorTunableWhite | `{"type":"SmartActuatorTunableWhite","value":{"temperature":4000,"brightness":50,"fadeTime":0.2}}` (Kelvin, %, seconds) |

- `value`, `forcedValue` and integration variables' `value` share this `{ type, value }` shape.
  Anything that matched no type became `{"type":"null","value":null}`.

### Links

A link joins one Loxone variable and one integration variable (`{ id, loxoneVariableId,
integrationVariableId }`), with no options: no transforms, no enabled flag, no label. Values flowed
in one direction, decided by the two variables:
- a Loxone INPUT feeds the linked integration OUTPUT (an action)
- an integration INPUT feeds the linked Loxone OUTPUT, converted to the Loxone type

An OUTPUT had at most one link, and INPUTs could fan out. In Nexus terms each link is a **wire**, from the
source signal to the target signal.

### Integrations

- **`type`** is PascalCase: `HomeAssistant`, `Calendar`, `Fronius`, `Webhook`, `Script`, `Mqtt`, `Sonos`, `Hue`.
- **`config`** is the integration's settings, in plaintext.
- **Variables:** an integration variable's `config` is `{ "action": "<name>", …its fields }`.
  - `INPUT` means the integration produces values (a Nexus **sensor**).
  - `OUTPUT` means it consumes them (a Nexus **actuator**).

| Type | `config` | Variables (`action`: fields) |
|---|---|---|
| HomeAssistant | `ws` (ws/wss URL), `token` | INPUT `state`: `entityId`, `key` ("state" or an attribute). OUTPUT: `entityId` and the action, e.g. `switch.set`, `light.set`, `light.brightness`, `light.rgbw`, `button.press`, `counter.*`, `media_player.*`, `water_heater.*`, `valve.*`, `lock.*`, `cover.*`, `timer.*`, `script.turn_on/off`, `scene.turn_on` |
| Calendar | `url`, `refetch` (`HOURLY`…`NEVER`) | INPUT `event`: `output` (`summary`, `description`, `start`, `end`, `url`, `event available`), `summaries[]`, `regex`, `regexLocation`, `timeBeforeEvent(+Modifier)`, `timeAfterEvent(+Modifier)`; store `ignoreEvents[]`. OUTPUT `stop_event`: `variableId` (an old integration variable id: remap it) |
| Fronius | `host` (URL), `pollInterval` (s) | INPUT `read`: `path` into `{ powerflow, meterRealtime, storageRealtime }` |
| Webhook | none | INPUT `hook`: `routeName`, `duration` (ms), `token?`; INPUT `hook_json`: `routeName`, `path` (lodash path), `token?`; store `count`, `last` |
| Script | none; store `active`, `code` (user JavaScript) | INPUT `script_variable`: `name`; OUTPUT `script_variable`: `name` |
| Mqtt | `url`, `username?`, `password?` | INPUT `subscribe`: `topic`; INPUT `subscribe_json`: `topic`, `path`; OUTPUT `publish`: `topic` |
| Sonos | `address` (IPv4) | INPUT `media info`: `type` (`title`, `playing`, `volume`, `muted`); OUTPUT `notification` (`volume?`, `uri?`), `play`, `pause`, `volume`, `next`, `previous` |
| Hue | `address` (IPv4); store `username` (the bridge app key) | OUTPUT `light.set`, `light.rgb`, `light.temperature`, `group.set`: `name` (a light or group name) |

**Old HomeAssistant actions that fired on a condition.**
- **Truthy values only:**
  - `button.press`, `counter.*`, `*.turn_on`
  - the media buttons
  - `valve.open_valve`, `cover.open_cover`
  - the cover tilt actions
  - `timer.*`
- **Falsy values only:** the `turn_off`, `close_cover`, `close_valve` and `media_player.turn_off` actions. The bugs were `scene.turn_on`, which fired on false, and `cover.close_cover_tilt`, which fired on true.

### Secrets in the export

- **Integration configs:**
  - HomeAssistant `token`
  - Mqtt `username` and `password`
  - Calendar `url`, which may carry a token
  - Webhook variables' `token`
- **Stores:**
  - Hue `store.username` (the bridge app key)
  - Script `code` (user JavaScript)
- **Users:** the users' argon2 hashes.

An importer maps them to secret config fields, which never leave the server (see "Server,
persistence, auth" in `architecture.md`). The webhook plugin has one token per instance, so per-hook
tokens need a decision.

### Mapping to Nexus (for the M6 importer)

| Old | Nexus |
|---|---|
| `loxone` | Miniserver (host, port, listen port, own and remote id) |
| `loxoneVariables` | Loxone signals (packet id, direction, data type, label; `forced` → a force) |
| `integration` | plugin instance of the plugin with that id (`HomeAssistant` → `homeassistant`, …), if installed |
| `integrationVariables` | plugin signals: `action` → capability, fields → params; needs a per-plugin table, because the new plugins' capabilities differ |
| `links` | wires |
| `user` | users (see the hash note) |

## Integrations not ported yet

### MQTT

- **Connection:** MQTT.js (`mqtt` 5.x), `connectAsync(url, { username, password })`. The URL scheme picks the transport: `mqtt`, `mqtts`, `ws`, `wss`.
- **Subscribing:** it subscribed to `#` (everything) and cached the last message per topic in memory, never expiring them.
- **`subscribe`:** emits the message text.
- **`subscribe_json`:** parses the message, emits `path` from it (objects as JSON text), and wrote the whole message to the database on every message.
- **`publish`:** publishes the value as text (QoS 0, no retain). Structured values were written as `"50% 0.2s"`, `"#RRGGBBWW 0.2s"` or `"4000K 50% 0.2s"`.
- **Bugs not to repeat:**
  - subscribing to `#`
  - the unbounded cache (a 5-minute expiry was declared but never used)
  - a database write per message
  - `start()` clearing every variable's store
  - `client.end()` not awaited
  - topic names decoded twice in the HTTP route

### Sonos

- **Connection:** `@svrooij/sonos` (`SonosDevice(address)`), UPnP/SOAP over HTTP to one speaker (port 1400).
- **Polling:** every 4 s, `GetZoneInfo` and `GetState`.
- **`media info`:**
  - `title` (string)
  - `playing` (boolean)
  - `volume` (number, -1 when unknown)
  - `muted` (boolean)
- **Actions:**
  - `notification`: a string value is the URI, a number the volume, `true` uses the configured URI; calls `PlayNotification`.
  - `play`, `pause`, `next`, `previous`: run on a truthy value.
  - `volume`: sets 0–100 on every value.
- **Bugs not to repeat:**
  - Every periodic update set `media info` to null (`updateValue(value.value)` on a primitive), so only the first value was right.
  - It created two devices.
  - The intervals had no owner.

### Hue

- **Connection:** `node-hue-api` v3 (Hue bridge v1 REST API over HTTP).
- **Pairing:** the first start pairs with the bridge (link button) and stores the app key.
- **Polling:** lights and groups every 10 s.
- **Feedback:** none, since there are no inputs.
- **Actions:** each addresses a light or group **by name** (case-insensitive, first match).
  - `light.set`: on or off.
  - `light.rgb`: RGB 0–100 % → 0–255. A white channel above 0 switches to colour temperature.
  - `light.temperature`: mired = 1e6 / Kelvin, plus brightness and a fade in ms.
  - `group.set`: on with brightness 1–100 %, or off.
- **Bugs not to repeat:**
  - Group fades were 1000× too short: seconds were passed as milliseconds.
  - Misspelt group types (`Lunimarie`, `Lighsource`).
  - Lights were addressed by name, so a rename broke outputs silently. Use ids.
  - The interval had no owner.
