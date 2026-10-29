# Home Assistant plugin

Connects Nexus to Home Assistant over its WebSocket API. Entity states, attributes and events
(such as button presses) come into Nexus as sensors; Nexus controls entities through Home
Assistant service calls.

## What it does

- **Sensors:** an entity's state or one of its attributes, a light's brightness or colour as a
  Loxone smart actuator value, and Home Assistant events of one type as text or a pulse.
- **Actuators:** switches, lights (brightness, RGBW, colour temperature), covers and valves
  (open/close, position, tilt), locks, thermostats and water heaters, scenes, scripts,
  automations and buttons, number, text, select and date/time helpers, to-do lists, and any
  other service call.
- **Catalog:** every entity by area and domain, with its state, attributes and the actuators that
  fit it, plus the button events of ZHA, deCONZ, Philips Hue, Lutron Caséta, notification actions
  and tags.
- **Panel:** the connection and since when, the Home Assistant version, the number of entities,
  the event types followed, reconnect attempts and the last problem.

## Before you start

- A Home Assistant instance that Nexus can reach over the network, and its address (by default
  port `8123`).
- A long-lived access token: in Home Assistant, open your profile, then **Security**, then
  **Long-lived access tokens**, and create one.
- For `event` sensors the token must belong to an **admin** user: Home Assistant lets only admins
  subscribe to most event types.

## Configuration

| Field | | Description |
|---|---|---|
| **URL** (`url`) | required | Address of Home Assistant, `http`, `https`, `ws` or `wss`, e.g. `http://homeassistant.local:8123`. `http(s)` becomes `ws(s)` and `/api/websocket` is appended, so a path such as a reverse proxy prefix (`https://proxy.lan/ha`) is kept. A full `wss://…/api/websocket` address works as it is. |
| **Access token** (`token`) | required; secret | The long-lived access token from your Home Assistant profile, e.g. `eyJhbGciOi…`. Never logged and never shown on the panel. |

## Sensors and actuators

| Kind | Name (id) | Value | What it is |
|---|---|---|---|
| sensor | State or attribute (`state`) | any | An entity's state (number, `on`/`off` as boolean, otherwise text) or one of its attributes. |
| sensor | Light (`light`) | any | A light's brightness (single channel, 0–100 %) or colour (RGBW, or tunable white in colour temperature mode). |
| sensor | Event (`event`) | any | Events of one type, e.g. `zha_event`: a data field as text, or a pulse per matching event. |
| actuator | On/off (`onOff`) | boolean | Switches on/off; opens/closes covers and valves; locks/unlocks locks. |
| actuator | Trigger (`trigger`) | boolean | On true, activates a scene, runs a script or automation, or presses a button. |
| actuator | Light brightness (`lightBrightness`) | single channel | Dims a light; 0 % turns it off. |
| actuator | Light colour (`lightColor`) | RGBW | Sets a light's colour; all channels at 0 turns it off. |
| actuator | Light colour temperature (`lightTemperature`) | tunable white | Sets colour temperature and brightness; brightness 0 turns it off. |
| actuator | Position (`position`) | number | Moves a cover or valve to 0 (closed) to 100 (open). |
| actuator | Tilt position (`tilt`) | number | Tilts a cover's slats, 0 (closed) to 100 (open). |
| actuator | Target temperature (`temperature`) | number | Sets the target temperature of a thermostat or water heater. |
| actuator | Number (`number`) | number | Sets a `number` or `input_number` entity. |
| actuator | Text or option (`text`) | string | Sets a text, picks a select option, or sets a thermostat's HVAC mode. |
| actuator | Date and time (`dateTime`) | any | Sets a date/time helper from text `YYYY-MM-DD HH:MM:SS`, or a time of day from seconds since midnight. |
| actuator | Add to-do item (`todoItem`) | string | Adds the text as an item to a to-do list. |
| actuator | Service call (`service`) | any | Calls any Home Assistant service, for what the others don't cover. |

## Good to know

- **A rejected token is never retried**, because Home Assistant can ban an address after failed
  logins. A wrong token at start puts the instance in the error state; a token revoked later
  leaves it degraded until you fix the config and restart the instance.
- An unreachable Home Assistant only makes the instance degraded; it reconnects on its own, and
  sensors catch up on what changed meanwhile. Events during the outage are lost.
- `unavailable` and `unknown` states send nothing, so Loxone keeps the last value instead of 0.
- The `trigger` actuator fires on true only, so a Loxone pulse runs a scene or script once. For
  scripts that run long, use `trigger`: a service call waits for the script and fails after 60 s.
- Home Assistant counts a cover position of 100 as open, Loxone shading 0 as fully up: invert
  the value with a wire transform if needed.

## More

The full reference (the params of every sensor and actuator, the service each actuator calls,
event filters and pulses, date and time formats, the catalog, the panel, connection behaviour,
limits and development notes) is in `REFERENCE.md` next to this file, and on the plugin's page
in the Nexus documentation.
