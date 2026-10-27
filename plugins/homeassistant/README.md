# Home Assistant plugin

Connects to Home Assistant over its **WebSocket API**. Entity states and attributes become
sensors. Service calls become actuators: lights, switches, covers, valves, locks, climate,
scenes, scripts, buttons, numbers, selects and texts, plus a generic service call. A catalog lists
every entity by area.

The plugin keeps one connection open. It subscribes to all entity states (`subscribe_entities`), so
sensors update without polling. It pings every 30 s to notice a dead connection, and reconnects
with a delay that doubles from 1 s up to 60 s. A long outage is reported once, not on every
retry. After a reconnect, the full state list catches the sensors up on what changed in between.
If that list arrives unreadable, the plugin logs it and reconnects for a fresh one.

## Config

| Field | | |
|---|---|---|
| `url` | required | Address of Home Assistant, e.g. `http://homeassistant.local:8123`. `http(s)` becomes `ws(s)`, and `/api/websocket` is appended. A `ws(s)://…/api/websocket` URL works as it is. |
| `token` | required, secret | A long-lived access token. Create one in your Home Assistant profile under **Security**. |

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

Params: `{ entityId, part }`, where the entity is a `light.*`.
- `part: "brightness"` sends the brightness as single channel, 0–100 %. Off sends 0. A light that
  is on sends at least 1 %, so a very dim light doesn't read as off. An on/off light that is on
  sends 100.
- `part: "color"` sends tunable white (Kelvin and brightness) while the light is in
  `color_temp` mode. Otherwise it sends RGBW with the brightness folded into the channels. Off
  sends brightness 0 in the shape last sent.

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
| `service` | any | any | See below. |

The light, position, tilt and value actuators run only the newest command when several queue up
(`concurrency: "latest"`), so a dragged slider doesn't replay every step.

### `service`: any service call

Params: `{ domain, service, entityId?, field?, data? }`. The value goes into `field`, e.g.
`media_player.volume_set` with `field: "volume_level"`. Structured values (RGBW, …) go in as
their object. `data` is sent with every call. Without a `field`, the actuator is a trigger: it
calls the service when the value is true or non-zero, and ignores false, 0 and empty text.

## Catalog

Area ▸ domain ▸ entity, with entities without an area under **No area** at the end. An entity's
area is its own, or its device's. Hidden and disabled entities are left out.

Each entity offers:
- its state
- every attribute with a single value, except descriptive ones like `friendly_name` or
  `supported_features`
- the `light` sensors, for lights
- the actuators that fit its domain and features. On/off (for some domains), position, tilt and
  temperature need the matching `supported_features` bits. Brightness, colour and colour
  temperature need the matching `supported_color_modes`.

The catalog reads the area, device and entity registries on demand.

## Panel

Shows the connection (and since when), the Home Assistant version, the entity count, reconnect
attempts and the last problem.

## Tests

- `FakeHomeAssistant` (in `src/test-support`) simulates the WebSocket API on 127.0.0.1: the auth
  handshake, `subscribe_entities` with change and remove events, recorded `call_service`, ping and
  the registry lists.
- `HomeAssistant.live.test.ts` runs read-only against a real instance when `HA_TEST_URL` and
  `HA_TEST_TOKEN` are set. It calls no service and never tries a wrong token.

## Known limitations

- `unavailable` and `unknown` aren't sent, so the last value stays, and a "was removed" failure
  stays until the entity has a reading again.
- No events (`subscribe_events`, e.g. `zha_event`), no `input_datetime`, and no calendar or todo
  services yet. The generic `service` actuator covers most of the rest.
- Colours read from `hs` or `xy` lights come from Home Assistant's `rgb_color`, which it reports at
  full brightness.
