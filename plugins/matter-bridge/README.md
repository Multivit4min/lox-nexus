# Matter bridge plugin

Shows devices you define in Nexus to Alexa, Google Home, Apple Home and Home Assistant as a Matter
bridge, on your own network without a cloud or skill. Their state comes from Nexus (for example a
Loxone output); what those apps command comes back into Nexus as sensors.

## What it does

- **Sensors:** commands from the apps per device: on/off, brightness, a blind's target position,
  a thermostat's setpoint.
- **Actuators:** each device's state for the apps: on/off, brightness, a blind's position,
  temperature, humidity, a door's contact, motion, a thermostat's setpoint.
- **Catalog:** one folder per configured device with exactly the signals its type has.
- **Panel:** the pairing QR code and code (while the bridge's own code works), the paired apps
  with a Remove button each, and every device with its last command and last state.
- **Actions:** Open pairing window (15 minutes, to add a second app) and Remove pairing.

## Before you start

- Nexus with host networking (`network_mode: host`, as in `compose.yaml`) and IPv6 enabled on the
  host, on the same network segment (VLAN) as your Echo, Google or Apple hub. mDNS (UDP 5353)
  must reach Nexus, and the UDP port (5540) must be open on the host's firewall.
- A Matter controller: an Echo of the 4th generation or newer, a Google Nest hub, an Apple TV or
  HomePod, or Home Assistant with its Matter integration.
- UDP port 5540 free on the host, or another one in the settings (Home Assistant's Matter Server
  and Matterbridge use 5540 too).
- About 150–200 MB of memory per running instance; one instance is enough for 50 devices.

## Configuration

| Field | | Description |
|---|---|---|
| **Bridge name** (`name`) | optional; default `Lox Nexus` | How the bridge shows in the apps, at most 32 bytes. |
| **UDP port** (`port`) | optional; default `5540` | The Matter port, 1024 to 65535. Change it only when another Matter program on the host uses 5540, e.g. to `5550`. |
| **Devices** (`devices`) | optional; default none | Up to 50 devices (Alexa's limit for one bridge), each with the two fields below; **Add** adds one. |
| **Name** (`devices[].name`) | required | What the apps call the device, e.g. `Kitchen light`; unique (ignoring case), at most 32 bytes. Renaming makes a new device in the apps. |
| **Type** (`devices[].type`) | required | `on-off-light`, `dimmable-light`, `plug`, `window-covering`, `thermostat`, `temperature-sensor`, `humidity-sensor`, `contact-sensor` or `occupancy-sensor`. |

## Sensors and actuators

| Kind | Name (id) | Value | What it is |
|---|---|---|---|
| sensor | On/off from controllers (`on-off`) | `boolean` | An app switched a light or plug on or off. |
| sensor | Brightness % from controllers (`brightness`) | `number` | An app dimmed a light (1–100), or 0 when it switched it off. |
| sensor | Target position % from controllers (`position`) | `number` | Where an app wants the blind, in % closed (0 open, 100 closed). |
| sensor | Heating setpoint °C from controllers (`setpoint`) | `number` | The temperature an app set on the thermostat. |
| actuator | On/off state to controllers (`on-off`) | `boolean` | Whether the light or plug is on. |
| actuator | Brightness % to controllers (`brightness`) | `number` | The light's brightness; 0 shows it off. |
| actuator | Current position % to controllers (`position`) | `number` | Where the blind is, in % closed. |
| actuator | Temperature °C to controllers (`temperature`) | `number` | A temperature sensor's value, or a thermostat's room temperature. |
| actuator | Humidity % to controllers (`humidity`) | `number` | A humidity sensor's value. |
| actuator | Open to controllers (`contact`) | `boolean` | On while the door or window is open. |
| actuator | Occupied to controllers (`occupancy`) | `boolean` | On while motion is detected. |
| actuator | Heating setpoint °C to controllers (`setpoint`) | `number` | The thermostat's setpoint (7–30 °C). |

## Good to know

- To pair, add a Matter device in the app and scan the QR code on the instance page, or type the
  11-digit code. Alexa warns that the bridge is not certified; that is expected.
- Wire each command sensor and its state actuator: a command that matches the state the bridge
  shows sends nothing new, so the state must come back from Loxone.
- A new device shows no temperature or humidity until Nexus first sends one; lights start off,
  contacts closed, motion clear. After a restart each device shows the last state it had.
- While a pairing window is open, anyone on your network who sees the code could pair. The code
  is shown only to logged-in users, and the window closes after 15 minutes.
- Alexa can't find the bridge? Usually mDNS or IPv6 doesn't reach it: check the VLAN, the
  firewall and the Wi-Fi's multicast settings (see the reference).

## More

The full reference (what each device type shows in the apps, how values convert, pairing more
apps and removing them, the panel, networking and troubleshooting, memory, limits, security notes
and development notes) is in `REFERENCE.md` next to this file, and on the plugin's page in the
Nexus documentation.
