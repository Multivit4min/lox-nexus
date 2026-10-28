# Home Assistant plugin

Connects to Home Assistant over its **WebSocket API**. Entity states, attributes and events (e.g.
`zha_event` button presses) become sensors. Service calls become actuators: lights, switches,
covers, valves, locks, climate, scenes, scripts, buttons, numbers, selects, texts, date/time
helpers and to-do lists, plus a generic service call. A catalog lists every entity by area, and
the events of common integrations.

The plugin keeps one connection open. It subscribes to all entity states (`subscribe_entities`), so
sensors update without polling. For events it subscribes once per event type in use
(`subscribe_events`), shared by all sensors of that type, and unsubscribes when the last of them is
removed. After a reconnect it subscribes again to every type in use. It pings every 30 s to notice a
dead connection, and reconnects with a delay that doubles from 1 s up to 60 s. A long outage is
reported once, not on every retry. After a reconnect, the full state list catches the sensors up on
what changed in between. If that list arrives unreadable, the plugin logs it and reconnects for a
fresh one.

## Config

| Field | Shown as | | |
|---|---|---|---|
| `url` | URL | required | Address of Home Assistant, e.g. `http://homeassistant.local:8123`. `http(s)` becomes `ws(s)`, and `/api/websocket` is appended. A `ws(s)://…/api/websocket` URL works as it is. |
| `token` | Access token | required, secret | A long-lived access token. Create one in your Home Assistant profile under **Security**. |

**A rejected token is never retried.** Home Assistant can ban an address after failed logins
(`ip_ban_enabled`). So a wrong token at start puts the instance in the error state. A token
revoked later leaves it degraded and disconnected until the config is fixed and the instance is
restarted. An unreachable Home Assistant only makes the instance degraded, and it keeps retrying.

## Sensors

### `state`: an entity's state or attribute (value type `any`)

Params: `{ entityId, attribute? }`. Home Assistant states are always text, so the plugin reads
them:

| State | Value |
|---|---|
| a number, e.g. `21.5` | number |
| `on` / `off` | boolean |
| `unavailable` / `unknown` | nothing is sent, so the last value stays (a Miniserver would otherwise get 0) |
| anything else, e.g. `heat`, `locked` | string |

Attributes keep their JSON type: number, boolean, string or null. Lists and objects (e.g.
`rgb_color`) are not offered. Use `light` for colours.

A deleted entity, or one that doesn't exist, marks the signal as failed. The failure clears when
the entity is back and sends a value.

### `light`: a light as a Loxone Smart Actuator value (value type `any`)

Params: `{ entityId, part }`, where the entity is a `light.*`. The form shows `part` as **What to send**.
- `part: "brightness"` sends the brightness as single channel, 0–100 %. Off sends 0. A light that
  is on sends at least 1 %, so a very dim light doesn't read as off. An on/off light that is on
  sends 100.
- `part: "color"` sends tunable white (Kelvin and brightness) while the light is in
  `color_temp` mode. Otherwise it sends RGBW with the brightness folded into the channels. Off
  sends brightness 0 in the shape last sent.

### `event`: Home Assistant events of one type (value type `any`)

For buttons and remotes that report presses as events rather than as entity states: ZHA
(`zha_event`), deCONZ (`deconz_event`), Philips Hue (`hue_event`), Shelly (`shelly.click`),
Lutron Caséta, tags (`tag_scanned`), actionable notifications (`mobile_app_notification_action`),
or an event your own automation fires.

| Param | Shown as | Default | |
|---|---|---|---|
| `eventType` | Event type | required | e.g. `zha_event`; up to 64 characters, no spaces |
| `filter` | Only events with | `{}` (every event) | Event data that must match, all of it, e.g. `{ "device_ieee": "00:15:8d:…", "command": "on" }`. A key may be a dot path (`args.0`, `params.button`). Numbers and text compare as text, so `"1"` matches `1`; lists and objects compare as JSON. |
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
`event` for deCONZ (e.g. `1002`), `click_type` for Shelly, and `action` for notifications. Hue names
the button in `subtype` (a number) and the kind of press in `type` (e.g. `short_release`), Lutron
the button in `button_number` and `press`/`release` in `action`. Tags send `tag_id`. Home
Assistant's **Developer tools ▸ Events** shows them: listen to the type and press the button. Most
carry the `device_id` of their device, which makes a good filter.

Home Assistant only lets **admin** users subscribe to most event types. With a token of another
user the subscription is refused, and the signal fails with Home Assistant's message. A refused
type is tried again only after a reconnect, or when it is added again after its last sensor was
removed. A subscription Home Assistant doesn't confirm within 10 s drops the connection, which
reconnects and subscribes anew. Events that
happen while disconnected are lost; nothing is sent for them after the reconnect. Newer
integrations (Matter, Z-Wave JS, …) report presses as `event.*` entities instead: those are entity
states, see `state` (the `event_type` attribute), not this sensor.

## Actuators

Each actuator follows one entity (`{ entityId }`). Adding one for an entity of another domain
fails. A call while disconnected, or one Home Assistant refuses (e.g. a number out of range),
fails the command with Home Assistant's message.

Home Assistant answers a service call only once the service has finished, and a call that takes
longer than 60 s fails. A script called as `script.<name>` (through `service`) runs to its end
first. Use `trigger` (`script.turn_on`) for long scripts: it returns as soon as the script
started.

| Id | Accepts | Domains | Service |
|---|---|---|---|
| `onOff` | boolean | switch, light, input_boolean, fan, automation, siren, humidifier, media_player, remote, climate, water_heater | `turn_on` / `turn_off`. Climate, media players, sirens and water heaters only when their `supported_features` allow it. |
| | | cover, valve | `open_cover` / `close_cover`, `open_valve` / `close_valve` |
| | | lock | `lock` / `unlock` |
| `trigger` | boolean | scene, script, button, input_button, automation | `turn_on`, `press` or `trigger` on **true only**. A Loxone pulse fires once. (The old integration activated scenes on false.) |
| `lightBrightness` | single channel | light | 0 → `turn_off`, else `turn_on` with `brightness_pct`. The fade time becomes `transition`. |
| `lightColor` | RGBW | light | All channels at 0 → `turn_off`. Otherwise `rgbw_color` for RGBW lights, or `rgb_color` with white mixed in. The brightest channel becomes `brightness_pct`. |
| `lightTemperature` | tunable white | light | Brightness 0 → `turn_off`, else `turn_on` with `color_temp_kelvin` and `brightness_pct` |
| `position` | number 0–100 | cover, valve | `set_cover_position` or `set_valve_position`. (The old integration called the latter on `water_heater`.) Home Assistant counts 100 as open. Loxone shading counts 0 as fully up, so the value may need inverting with a wire transform. |
| `tilt` | number 0–100 | cover | `set_cover_tilt_position` |
| `temperature` | number | climate, water_heater | `set_temperature`. Not offered for thermostats with only a low/high range (`heat_cool`). |
| `number` | number | number, input_number | `set_value` |
| `text` | string | text, input_text, select, input_select, climate | `set_value`, `select_option`, or `set_hvac_mode` for climate |
| `dateTime` | string or number | input_datetime, date, time, datetime | See below. |
| `todoItem` | string | todo | `add_item` with the text as the item, trimmed. Empty text adds nothing. Offered for lists that can add items. |
| `service` | any | any | See below. |

The light, position, tilt, value and date/time actuators run only the newest command when several
queue up (`concurrency: "latest"`), so a dragged slider doesn't replay every step.

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
nothing; other text, and numbers outside a day, fail the command.

- `input_datetime` (helpers) gets `set_datetime` with whatever the value has: `datetime`, `date` or
  `time`. A helper with only a time takes the time part of a full date and time, one with only a
  date the date part. Setting only the time of a helper with a date keeps its date. A value with
  nothing the helper holds (a time for a date-only helper) fails.
- `date`, `time` and `datetime` entities get `set_value`, and need what they hold: a date, a time,
  or both. Home Assistant reads the time in its own time zone.

### `service`: any service call

Params: `{ domain, service, entityId?, field?, data? }`, shown in the form as **Service domain**,
**Service**, **Target entity**, **Value goes into field** and **Extra service data**. The value
goes into `field`, e.g. `media_player.volume_set` with `field: "volume_level"`. Structured values
(RGBW, …) go in as their object. `data` is sent with every call. Without a `field`, the actuator is a trigger: it
calls the service when the value is true or non-zero, and ignores false, 0 and empty text.

## Catalog

Area ▸ domain ▸ entity, with entities without an area under **No area** at the end. Domains are
named in words (`binary_sensor` becomes **Binary sensor**), and attributes in entry labels too
("Blind current position"); the entity's own node still shows its ID. An entity's
area is its own, or its device's. Hidden and disabled entities are left out.

Each entity offers:
- its state
- every attribute with a single value, except descriptive ones like `friendly_name` or
  `supported_features`
- the `light` sensors, for lights
- the actuators that fit its domain and features. On/off (for some domains), position, tilt,
  temperature and to-do items need the matching `supported_features` bits. Brightness, colour and
  colour temperature need the matching `supported_color_modes`.

**Events** comes last. It lists common event types: ZHA, deCONZ, Philips Hue and Lutron Caséta when
Home Assistant has devices of that integration, actionable notifications when it has mobile app
devices, and tags always. Each offers one `event` sensor for all its events, and the ZHA, deCONZ,
Hue and Lutron types one per enabled device (filtered by `device_id`). They send the field that
tells the buttons apart (`command`, `event`, `subtype`, `button_number`, `action`, `tag_id`). For a
filter on it (e.g. only Hue's `short_release`), or a pulse, add an `event` sensor by hand with those
params. A device's `device_id` is the last part of its page's address in Home Assistant
(`/config/devices/device/<device_id>`).

The catalog reads the area, device and entity registries on demand.

## Panel

Shows the connection (and since when), the Home Assistant version, the entity count, the event
types followed (marked `(pending)` until Home Assistant confirms them, or `(refused)`), reconnect
attempts and the last problem.

## Tests

- `FakeHomeAssistant` (in `src/test-support`) simulates the WebSocket API on 127.0.0.1: the auth
  handshake, `subscribe_entities` with change and remove events, `subscribe_events` and
  `unsubscribe_events` with fired events (and refusals), recorded `call_service`, ping and the
  registry lists.
- The event sensor's pulses are tested on the SDK's `TestClock`.
- `HomeAssistant.live.test.ts` runs read-only against a real instance when `HA_TEST_URL` and
  `HA_TEST_TOKEN` are set. It follows `state_changed` events, calls no service and never tries a
  wrong token.

## Known limitations

- `unavailable` and `unknown` aren't sent, so the last value stays, and a "was removed" failure
  stays until the entity has a reading again.
- No calendar services: `calendar.create_event` needs a summary, a start and an end, more than one
  Loxone value can carry. The generic `service` actuator covers it with fixed data, and most of
  the rest.
- Events that happen while disconnected are not sent after the reconnect.
- Colours read from `hs` or `xy` lights come from Home Assistant's `rgb_color`, which it reports at
  full brightness.
