# The previous Nexus: unported integrations

The previous implementation lives at github.com/Multivit4min/loxone-nexus (server, commit `53fd946`)
and github.com/Multivit4min/loxone-nexus-frontend (UI, commit `22d9a54`). It is no longer kept in
this repository. File references below (`src/…:line`) point into the server repository at that
commit. This page keeps what future plugins need from it. (Its export format isn't imported: Lox Nexus
starts fresh, decided 2026-10-28.) Its known bugs that
the rewrite fixed are in `architecture.md` and `loxone-ici-review.md`.

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
