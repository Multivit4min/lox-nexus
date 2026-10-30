## Connection

The plugin keeps one WebSocket connection to `<url>/api/websocket` open and logs in with the
token.

- It subscribes to all entity states (`subscribe_entities`), so sensors update without polling.
  The first message lists every entity; after a reconnect, that full list catches the sensors up
  on what changed in between, and entities missing from it count as removed. If the list arrives
  unreadable, the plugin logs it and reconnects for a fresh one.
- For events it subscribes once per event type in use (`subscribe_events`), shared by all sensors
  of that type, and unsubscribes when the last of them is removed. After a reconnect it subscribes
  again to every type in use.
- It pings every 30 s; a ping without an answer within 10 s drops the connection.
- It reconnects with a delay that doubles from 1 s up to 60 s, and starts over at 1 s after a
  successful connection. A long outage is reported once, not on every retry.
- The login and every request time out after 10 s, except service calls, which may take 60 s.

Status of the instance:

| Situation | Status |
|---|---|
| connected | running |
| Home Assistant unreachable or the connection lost | degraded (`disconnected: <reason>; reconnecting`), retrying |
| token rejected at start | error; not retried |
| token rejected on a later reconnect | degraded (`… Fix the token and restart the instance.`); not retried until the instance is restarted |

A rejected token is never retried because Home Assistant can ban an address after failed logins
(`ip_ban_enabled`).

**Test connection** in the settings form logs in over the WebSocket API with the URL and token, names Home Assistant's version and disconnects; it reads nothing. A refused token is a failed login like any other: check it before trying again, since repeated ones can get the Nexus address blocked (`ip_ban_enabled`), the running instance with it.

## Sensors

Every sensor that follows an entity takes the entity's ID in **Entity ID** (`entityId`), e.g.
`sensor.outdoor_temperature`. An entity that doesn't exist, or one deleted from Home Assistant,
marks the signal as failed. The failure clears as soon as the entity is back, even while it is
still `unavailable`. While disconnected, the last value stays.

### `state`: State or attribute

| Param | Shown as | Default | |
|---|---|---|---|
| `entityId` | Entity ID | required | e.g. `sensor.outdoor_temperature` |
| `attribute` | Attribute | none (the state) | An attribute to read instead of the state, e.g. `current_temperature` |

Home Assistant states are always text, so the plugin reads them:

| State | Value |
|---|---|
| a number, e.g. `21.5` | number |
| `on` / `off` | boolean |
| `unavailable` / `unknown` | nothing is sent, so the last value stays (a Miniserver would otherwise get 0) |
| anything else, e.g. `heat`, `locked`, `2026-10-27T10:00:00+00:00` | string |

Attributes keep their JSON type: number, boolean, string or null. An attribute that is a list or
an object (e.g. `rgb_color`), or that the entity doesn't have, sends nothing; the catalog doesn't
offer those. Use `light` for colours.

### `light`: Light

| Param | Shown as | Default | |
|---|---|---|---|
| `entityId` | Entity ID | required | a `light.*` entity, e.g. `light.kitchen` |
| `part` | What to send | `brightness` | `brightness` or `color` |

- `part: "brightness"` sends the brightness as single channel, 0–100 %. Off sends 0. A light that
  is on sends at least 1 %, so a very dim light doesn't read as off. An on/off light that is on
  sends 100.
- `part: "color"` sends tunable white (Kelvin and brightness) while the light is in `color_temp`
  mode. Otherwise it sends RGBW with the brightness folded into the channels: from `rgbw_color`
  in `rgbw` mode, from `rgb_color` in the other colour modes. A light without colour channels
  (e.g. in `white` or `brightness` mode) sends its brightness as the white channel. Off sends
  brightness 0 in the shape last sent (tunable white stays tunable white).
- `unavailable` and `unknown` send nothing.

### `event`: Event

For buttons and remotes that report presses as events rather than as entity states: ZHA
(`zha_event`), deCONZ (`deconz_event`), Philips Hue (`hue_event`), Shelly (`shelly.click`),
Lutron Caséta (`lutron_caseta_button_event`), tags (`tag_scanned`), actionable notifications
(`mobile_app_notification_action`), or an event your own automation fires.

| Param | Shown as | Default | |
|---|---|---|---|
| `eventType` | Event type | required | e.g. `zha_event`; 1 to 64 characters, no spaces. `*` (every event) isn't allowed. |
| `filter` | Only events with | `{}` (every event) | Event data that must match, all of it, e.g. `{ "device_ieee": "00:15:8d:…", "command": "on" }`. A key may be a dot path (`args.0`, `params.button`). Numbers, booleans and text compare as text, so `"1"` matches `1`; lists and objects compare as JSON. |
| `send` | What to send | `field` | `field`: the data field below as text. `pulse`: `true` for each matching event. |
| `field` | Data field | `command` | With `send: "field"`: the field to send, also a dot path. Numbers and booleans are written out, lists and objects as JSON, cut to 1000 characters. An event without the field (or with null or empty text) sends nothing. |
| `pulseMs` | Pulse length (ms) | `1000` | How long the value stays before it returns to `false` (or empty text), 50 to 3 600 000 ms. |

The sensor starts at `false` (pulse) or empty text (field). After each matching event the value
**returns to `false` or empty text** after `pulseMs`. Nexus drops a value equal to the one before,
so without the reset a button pressed twice would reach Loxone once. An event during the pulse
restarts its timer: the same command twice within `pulseMs` is one pulse, a different command is
sent at once. In Loxone, a virtual text input takes the text; for a pulse per command, use
`send: "pulse"` with the command in the filter.

Which fields an event has depends on the integration: the button's action is `command` for ZHA,
`event` for deCONZ (e.g. `1002`), `click_type` for Shelly, and `action` for notifications. Hue
names the button in `subtype` (a number) and the kind of press in `type` (e.g. `short_release`),
Lutron the button in `button_number` and `press`/`release` in `action`. Tags send `tag_id`. Home
Assistant's **Developer tools ▸ Events** shows them: listen to the type and press the button. Most
carry the `device_id` of their device, which makes a good filter.

Home Assistant only lets **admin** users subscribe to most event types. With a token of another
user the subscription is refused, and the signal fails with Home Assistant's message. A refused
type is tried again only after a reconnect, or when it is added again after its last sensor was
removed. A subscription Home Assistant doesn't confirm within 10 s drops the connection, which
reconnects and subscribes anew. Events that happen while disconnected are lost; nothing is sent
for them after the reconnect.

Newer integrations (Matter, Z-Wave JS, …) report presses as `event.*` entities instead: those are
entity states, read with `state` (the `event_type` attribute), not with this sensor.

## Actuators

Every actuator but `service` follows one entity: its only param is **Entity ID** (`entityId`).
Adding one for an entity of another domain fails. A call while disconnected, or one Home
Assistant refuses (e.g. a number out of range), fails the command with Home Assistant's message.

An actuator whose entity doesn't exist in Home Assistant (renamed or removed) shows the error
"Home Assistant has no entity …" (or "… was removed from Home Assistant") on its signal and refuses
commands, which Home Assistant would otherwise answer with success while doing nothing. It clears
by itself once the entity is back. A `service` actuator with an entity ID does the same, one without isn't
checked. `position` and `tilt` suggest the unit `%` for new signals.

Home Assistant answers a service call only once the service has finished, and a call that takes
longer than 60 s fails. A script called as `script.<name>` (through `service`) runs to its end
first. Use `trigger` (`script.turn_on`) for long scripts: it returns as soon as the script
started.

| Id | Accepts | Domains | Service |
|---|---|---|---|
| `onOff` | boolean | switch, light, input_boolean, fan, automation, siren, humidifier, media_player, remote, climate, water_heater | `turn_on` / `turn_off` |
| | | cover, valve | `open_cover` / `close_cover`, `open_valve` / `close_valve` |
| | | lock | `lock` / `unlock` (true locks) |
| `trigger` | boolean | scene, script, button, input_button, automation | `turn_on` (scene, script), `press` (buttons) or `trigger` (automation), on **true only** |
| `lightBrightness` | single channel | light | 0 → `turn_off`, else `turn_on` with `brightness_pct`. The fade time becomes `transition`. |
| `lightColor` | RGBW | light | All channels at 0 → `turn_off`. Otherwise `turn_on` with `rgbw_color` for lights that support `rgbw` mode, or `rgb_color` with white mixed in (each channel capped at 100 %). The brightest channel becomes `brightness_pct`. The fade time becomes `transition`. |
| `lightTemperature` | tunable white | light | Brightness 0 → `turn_off`, else `turn_on` with `color_temp_kelvin` and `brightness_pct`. The fade time becomes `transition`. |
| `position` | number 0–100 | cover, valve | `set_cover_position` or `set_valve_position`. The value is rounded and limited to 0–100. |
| `tilt` | number 0–100 | cover | `set_cover_tilt_position`. The value is rounded and limited to 0–100. |
| `temperature` | number | climate, water_heater | `set_temperature`, in the unit Home Assistant uses |
| `number` | number | number, input_number | `set_value` |
| `text` | string | text, input_text, select, input_select, climate | `set_value`, `select_option`, or `set_hvac_mode` for climate (e.g. `heat`, `off`) |
| `dateTime` | any (text or number) | input_datetime, date, time, datetime | See below. |
| `todoItem` | string | todo | `add_item` with the text as the item, trimmed. Empty text adds nothing. |
| `service` | any | any | See below. |

A fade time of 0 sends no `transition`, since not every light accepts one.

`lightBrightness`, `lightColor`, `lightTemperature`, `position`, `tilt`, `temperature`, `number`,
`text` and `dateTime` run only the newest command when several queue up
(`concurrency: "latest"`), so a dragged slider doesn't replay every step.

Home Assistant counts a cover position of 100 as open. Loxone shading counts 0 as fully up, so the
value may need inverting with a wire transform.

### `dateTime`: date and time helpers

Accepts text or a number:

| Value | Means | Example |
|---|---|---|
| text `YYYY-MM-DD HH:MM:SS` | date and time (a `T` instead of the space works, seconds may be left out) | `2026-10-28 06:30:00` |
| text `YYYY-MM-DD` | a date | `2026-12-24` |
| text `HH:MM` or `HH:MM:SS` | a time of day | `6:30` |
| a number | a time of day in **seconds since midnight**, 0 to 86 399 | `23400` (06:30) |

Loxone calculates in numbers, so a time of day computed in a formula block (hours × 3600 + minutes
× 60) can go straight in. Text comes from a virtual output's text command. Empty text does
nothing; other text, numbers outside a day and other value types fail the command.

- `input_datetime` (helpers) gets `set_datetime` with whatever the value has: `datetime`, `date` or
  `time`. A helper with only a time takes the time part of a full date and time, one with only a
  date the date part. Setting only the time of a helper with a date keeps its date. A value with
  nothing the helper holds (a time for a date-only helper) fails.
- `date`, `time` and `datetime` entities get `set_value`, and need what they hold: a date, a time,
  or both. Home Assistant reads the time in its own time zone.

### `service`: Service call

| Param | Shown as | Default | |
|---|---|---|---|
| `domain` | Service domain | required | The part before the dot, e.g. `media_player` for `media_player.volume_set` |
| `service` | Service | required | The part after the dot, e.g. `volume_set` |
| `entityId` | Target entity | none | The entity the service acts on, e.g. `media_player.living_room`; empty for services that take none |
| `field` | Value goes into field | none | The service data field that receives the value, e.g. `volume_level` |
| `data` | Extra service data | `{}` | Further service data, sent with every call |

With a `field`, every value is sent in it; structured values (RGBW, …) go in as their object, and
a value in `field` replaces the same key in `data`. Without a `field`, the actuator is a trigger:
it calls the service with `data` when the value is true, a non-zero number or non-empty text, and
ignores everything else (false, 0, empty text, structured values).

## Catalog

Area ▸ domain ▸ entity, with entities without an area under **No area** at the end. Domains are
named in words (`binary_sensor` becomes **Binary sensor**), and attributes in entry labels too
("Blind current position"); the entity's own node shows its name and ID. An entity's area is its
own, or its device's. Hidden and disabled entities are left out; entities without a registry
entry (e.g. defined in YAML) have no area.

Each entity offers:
- its state, with its unit
- every attribute with a single value, except descriptive ones (`friendly_name`, `icon`,
  `entity_picture`, `supported_features`, `attribution`, `assumed_state`, `restored`, `editable`,
  `device_class`, `state_class`, `unit_of_measurement`, `id`, `mode`, `step`)
- for lights, the `light` brightness sensor, and the colour sensor for lights with a colour or
  colour temperature mode
- the actuators that fit its domain and features, with the current value where there is one:
  - `onOff` for climate, media players and sirens needs the turn on and turn off features, for
    water heaters the on/off feature, for covers and valves open and close
  - `position`, `tilt`, `temperature` (not for thermostats with only a low/high range) and
    `todoItem` need the matching `supported_features` bit
  - `lightBrightness` needs a colour mode other than on/off, `lightColor` an `rgb`, `rgbw`,
    `rgbww`, `hs` or `xy` mode, `lightTemperature` the `color_temp` mode

These conditions only decide what the catalog offers; an actuator added by hand is checked only
for its domain.

**Events** comes last. It lists common event types: ZHA, deCONZ, Philips Hue and Lutron Caséta when
Home Assistant has enabled devices of that integration, actionable notifications when it has
mobile app devices, and tags always. Each offers one `event` sensor for all its events, and the
ZHA, deCONZ, Hue and Lutron types one per enabled device (filtered by `device_id`). They send the
field that tells the buttons apart (`command`, `event`, `subtype`, `button_number`, `action`,
`tag_id`). For a filter on it (e.g. only Hue's `short_release`), or a pulse, add an `event` sensor
by hand with those params. A device's `device_id` is the last part of its page's address in Home
Assistant (`/config/devices/device/<device_id>`).

The catalog reads the area, device and entity registries each time it is opened, so it needs a
connection.

## Panel

| Field | Shows |
|---|---|
| Connection | `connected since <time>` or `disconnected` |
| Home Assistant version | as Home Assistant reports it at login |
| Entities | the number of entities |
| Event types followed | the event types in use, marked `(pending)` until Home Assistant confirms them (also while disconnected) or `(refused)` |
| Reconnect attempts | reconnects since the instance started |
| Last problem | the last connection problem, shown only until the next successful connection |

The token never appears on the panel or in the log.

### Debug log

With **Debug for 15 min** on the instance's log card, the log also gets the entities loaded at login, each
event type subscribed, each reconnect with its delay and reason, and each service call with its
entity and the names of its data fields; not their values, which may be a lock's or an alarm's code.

## Limits

- `unavailable` and `unknown` aren't sent, so the last value stays, and a "was removed" failure
  stays until the entity exists again.
- No calendar services: `calendar.create_event` needs a summary, a start and an end, more than one
  Loxone value can carry. The generic `service` actuator covers it with fixed data, and most of
  the rest.
- Events that happen while disconnected are not sent after the reconnect.
- Colours of `hs` and `xy` lights are read from Home Assistant's `rgb_color`, a conversion it
  reports at full brightness; the plugin scales it by the brightness.
- Thermostats with only a low/high range (`heat_cool`) can't be set: that needs two values.

## Fixed compared to the old integration

- Scenes are activated on true only, so a Loxone pulse activates a scene once; the old
  integration activated them on false.
- A valve's position goes to `valve.set_valve_position`; the old integration called it on the
  `water_heater` domain.

## Development

- `npm run build -w @lox-nexus/plugin-homeassistant` bundles `src/index.ts` with esbuild into
  `dist/plugin.js`.
- `FakeHomeAssistant` (in `src/test-support`) simulates the WebSocket API on 127.0.0.1: the auth
  handshake, `subscribe_entities` with change and remove events, `subscribe_events` and
  `unsubscribe_events` with fired events (and refusals), recorded `call_service`, ping and the
  registry lists.
- The event sensor's pulses are tested on the SDK's `TestClock`.
- `HomeAssistant.live.test.ts` runs read-only against a real instance when `HA_TEST_URL` and
  `HA_TEST_TOKEN` are set. It follows `state_changed` events, calls no service and never tries a
  wrong token.
