# Matter bridge plugin

Shows devices you define in Nexus to Alexa, Google Home, Apple Home and Home Assistant as a Matter
bridge, on your own network without a cloud or skill. Their state comes from Nexus (for example a
Loxone output); what those apps command comes back into Nexus as sensors.

## What it does

- **Sensors:** commands from the apps per device: on/off, brightness, colour temperature, a
  blind's target position, a thermostat's setpoint, a fan's speed, lock and unlock requests.
- **Actuators:** each device's state for the apps: on/off, brightness, colour temperature, a
  blind's position, temperature, humidity, contact, motion, a setpoint, fan speed, a lock, smoke
  and CO alarms, water leaks, and button presses that start routines.
- **Catalog:** one folder per device with exactly the signals its type has.
- **Panel:** the pairing QR code and code (while the bridge's own code works), the paired apps
  with a Remove button each, and every device with its id, last command and last state, with
  Edit and Remove buttons.
- **Actions:** Add device, Edit device, Remove device (while the bridge runs, no restart), Open
  pairing window (15 minutes, to add a second app) and Remove pairing.

## Before you start

- Nexus with host networking (`network_mode: host`, as in `compose.yaml`) and IPv6 enabled on the
  host, on the same network segment (VLAN) as your Echo, Google or Apple hub. mDNS (UDP 5353)
  must reach Nexus, and the UDP port (5540) must be open on the host's firewall.
- A Matter controller: an Echo of the 4th generation or newer, a Google Nest hub, an Apple TV or
  HomePod, or Home Assistant with its Matter integration.
- UDP port 5540 free on the host, or another one in the settings (Home Assistant's Matter Server
  and Matterbridge use 5540 too).
- About 180–230 MB of memory per running instance; one instance is enough for 50 devices.

## Configuration

| Field | | Description |
|---|---|---|
| **Bridge name** (`name`) | optional; default `Lox Nexus` | How the bridge shows in the apps, at most 32 bytes. |
| **UDP port** (`port`) | optional; default `5540` | The Matter port, 1024 to 65535. Change it only when another Matter program on the host uses 5540, e.g. to `5550`. |

Devices are not settings: add them with **Add device** on the instance page (name, type, and for
door locks **Allow unlocking**), at most 50 (Alexa's limit for one bridge).

## Sensors and actuators

| Kind | Name (id) | Value | What it is |
|---|---|---|---|
| sensor | On/off from controllers (`on-off`) | `boolean` | An app switched a light, plug or fan on or off. |
| sensor | Brightness % from controllers (`brightness`) | `number` | An app dimmed a light (1–100), or 0 when it switched it off. |
| sensor | Colour temperature K from controllers (`color-temperature`) | `number` | An app set a tunable white light's colour temperature. |
| sensor | Tunable white from controllers (`tunable-white`) | `tunableWhite` | Colour temperature and brightness together, for a Loxone tunable-white actuator. |
| sensor | Target position % from controllers (`position`) | `number` | Where an app wants the blind, in % closed (0 open, 100 closed). |
| sensor | Heating setpoint °C from controllers (`setpoint`) | `number` | The temperature an app set on the thermostat. |
| sensor | Fan speed % from controllers (`fan-speed`) | `number` | The speed an app set on a fan (0–100). |
| sensor | Lock request from controllers (`lock`) | `boolean` | `true` to lock, `false` to unlock (only if the lock allows unlocking). |
| actuator | On/off state to controllers (`on-off`) | `boolean` | Whether the light, plug or fan is on. |
| actuator | Brightness % to controllers (`brightness`) | `number` | The light's brightness; 0 shows it off. |
| actuator | Colour temperature K to controllers (`color-temperature`) | `number` | The light's colour temperature (2700–6500 K). |
| actuator | Tunable white to controllers (`tunable-white`) | `tunableWhite` | Colour temperature and brightness together. |
| actuator | Current position % to controllers (`position`) | `number` | Where the blind is, in % closed. |
| actuator | Temperature °C to controllers (`temperature`) | `number` | A temperature sensor's value, or a thermostat's room temperature. |
| actuator | Humidity % to controllers (`humidity`) | `number` | A humidity sensor's value. |
| actuator | Open to controllers (`contact`) | `boolean` | On while the door or window is open. |
| actuator | Occupied to controllers (`occupancy`) | `boolean` | On while motion is detected. |
| actuator | Heating setpoint °C to controllers (`setpoint`) | `number` | The thermostat's setpoint (7–30 °C). |
| actuator | Fan speed % to controllers (`fan-speed`) | `number` | The fan's speed; 0 shows it off. |
| actuator | Locked to controllers (`locked`) | `boolean` | Whether the lock is locked. |
| actuator | Smoke alarm to controllers (`smoke`) | `boolean` | A smoke alarm Nexus reports, e.g. from Loxone's fire alarm. |
| actuator | CO alarm to controllers (`co`) | `boolean` | A carbon monoxide alarm Nexus reports. |
| actuator | Leak to controllers (`leak`) | `boolean` | On while a water leak is detected. |
| actuator | Press to controllers (`press`) | `boolean` | Each `true` is a short button press, to start routines. |
| actuator | Long press to controllers (`long-press`) | `boolean` | Each `true` is a long button press. |

## Good to know

- To pair, add a Matter device in the app and scan the QR code on the instance page, or type the
  11-digit code. Alexa warns that the bridge is not certified; that is expected.
- Renaming a device keeps it in the apps (Alexa may show the old name until you rename it there);
  removing and adding it again makes a new device, and its routines are lost.
- Wire each command sensor and its state actuator: a command that matches the state the bridge
  shows sends nothing new, so the state must come back from Loxone.
- Door locks refuse unlocking from the apps unless **Allow unlocking** is on. The smoke and CO
  alarm only forwards what Nexus reports; it is no replacement for a certified smoke detector.
- While a pairing window is open, anyone on your network who sees the code could pair. Alexa
  can't find the bridge? Usually mDNS or IPv6 doesn't reach it (see the reference).

## More

The full reference (managing devices, what each device type shows in the apps and what Alexa does
with it, how values convert, pairing more apps and removing them, the panel, networking and
troubleshooting, storage, memory, limits, security notes and development notes) is in
`REFERENCE.md` next to this file, and on the plugin's page in the Nexus documentation.
