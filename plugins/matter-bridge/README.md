# Matter bridge plugin

Shows devices you define in Nexus to Alexa, Google Home, Apple Home and Home Assistant as a Matter
bridge, on your own network without a cloud or skill. Their state comes from Nexus (for example a
Loxone output); what those apps command comes back into Nexus as sensors.

## What it does

- **Sensors:** commands from the apps per device: on/off, brightness, colour temperature, colour,
  a blind's target position and slat angle, a thermostat's setpoints and mode, a fan's speed, lock
  and unlock requests, opening and closing a valve, a wallbox's charging release, current and mode.
- **Actuators:** each device's state for the apps: the same values back, plus temperature,
  humidity, illuminance, pressure, flow, air quality, CO₂ and PM2.5, contact, motion, smoke and CO
  alarms, water leaks, rain, frost, battery levels, button and doorbell presses that start
  routines, and energy: power, energy, voltage and current of meters, PV systems, home batteries,
  wallboxes and heat pumps, and a wallbox's car and session.
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

Devices are not settings: add them with **Add device** on the instance page (name, type, for door
locks **Allow unlocking**, for battery-powered sensors and buttons **Battery**), at most 50
(Alexa's limit for one bridge).

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
| sensor | Target slat angle % from controllers (`tilt`) | `number` | Where an app wants the slats, in % closed. |
| sensor | Colour from controllers (`color`) | `rgbw` | The colour an app set, brightness included, for a Loxone RGBW actuator. |
| sensor | Cooling setpoint °C from controllers (`cooling-setpoint`) | `number` | The temperature an app set to cool to. |
| sensor | Mode from controllers (`mode`) | `string` | The thermostat mode an app picked: `off`, `heat`, `cool` or `auto`. |
| sensor | Open or close from controllers (`valve`) | `boolean` | `true` when an app opens the valve, `false` when it closes it. |
| sensor | Charging enabled from controllers (`charging-enabled`) | `boolean` | Whether an app enabled or disabled the wallbox's charging. |
| sensor | Maximum charging current A from controllers (`max-current`) | `number` | The current an app allowed when it enabled charging. |
| sensor | Charging mode from controllers (`charging-mode`) | `string` | `manual`, `time-of-use` or `solar`. |
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
| actuator | Current slat angle % to controllers (`tilt`) | `number` | Where the slats are, in % closed. |
| actuator | Colour to controllers (`color`) | `rgbw` | The light's colour from a Loxone RGBW actuator; all 0 shows it off. |
| actuator | Cooling setpoint °C to controllers (`cooling-setpoint`) | `number` | The thermostat's cooling setpoint (16–32 °C). |
| actuator | Mode to controllers (`mode`) | `string` | The thermostat's mode: `off`, `heat`, `cool` or `auto`. |
| actuator | Valve open to controllers (`valve`) | `boolean` | Whether the valve is open. |
| actuator | Air quality level to controllers (`air-quality`) | `number` | 1 good to 6 extremely poor; without it, the level follows CO₂ and PM2.5. |
| actuator | CO₂ ppm to controllers (`co2`) | `number` | The CO₂ concentration. |
| actuator | PM2.5 µg/m³ to controllers (`pm25`) | `number` | The fine dust concentration. |
| actuator | Illuminance lx to controllers (`illuminance`) | `number` | A light sensor's brightness in lux. |
| actuator | Pressure hPa to controllers (`pressure`) | `number` | A pressure sensor's value in hPa. |
| actuator | Flow m³/h to controllers (`flow`) | `number` | A flow sensor's value in m³/h. |
| actuator | Rain to controllers (`rain`) | `boolean` | On while rain is detected. |
| actuator | Frost to controllers (`freeze`) | `boolean` | On while a water freeze detector warns of frost. |
| actuator | Battery % to controllers (`battery`) | `number` | The battery level of a sensor, button or doorbell added with **Battery**. |
| actuator | Press to controllers (`press`) | `boolean` | Each `true` is a short button press, to start routines. |
| actuator | Long press to controllers (`long-press`) | `boolean` | Each `true` is a long button press. |
| actuator | Power W to controllers (`power`) | `number` | Power taken (positive) or given (negative): a meter, battery, wallbox or heat pump. |
| actuator | PV power W to controllers (`production`) | `number` | The power a PV system produces. |
| actuator | Energy imported kWh to controllers (`energy-imported`) | `number` | Total energy taken: grid import, a battery's charge, a wallbox's or heat pump's use. |
| actuator | Energy exported kWh to controllers (`energy-exported`) | `number` | Total energy given: feed-in, PV production, a battery's discharge. |
| actuator | Voltage V to controllers (`voltage`) | `number` | A meter's voltage. |
| actuator | Current A to controllers (`current`) | `number` | A meter's current. |
| actuator | Car plugged in to controllers (`plugged-in`) | `boolean` | Whether a car is at the wallbox; plugging in starts a session. |
| actuator | Charging to controllers (`charging`) | `boolean` | Whether the car charges. |
| actuator | Charging enabled to controllers (`charging-enabled`) | `boolean` | Whether the wallbox may charge. |
| actuator | Maximum charging current A to controllers (`max-current`) | `number` | The current the wallbox may charge with (6–32 A). |
| actuator | Charging mode to controllers (`charging-mode`) | `string` | `manual`, `time-of-use` or `solar`. |
| actuator | Session energy kWh to controllers (`session-energy`) | `number` | The energy charged since the car was plugged in. |

## Matter device types

Every device type matter.js 0.18 knows, which covers the Matter specification up to 1.5, and
whether the bridge offers it. What an app shows of a type is up to the app; the newer the type,
the fewer apps know it.

| Matter device type | Id | In the bridge |
|---|---|---|
| **Lighting** | | |
| On/Off Light | 0x0100 | `on-off-light` |
| Dimmable Light | 0x0101 | `dimmable-light` |
| Color Temperature Light | 0x010C | `color-temperature-light` |
| Extended Color Light | 0x010D | `color-light` |
| **Plugs and wall controls** | | |
| On/Off Plug-in Unit | 0x010A | `plug` |
| Dimmable Plug-in Unit | 0x010B | `dimmable-plug` |
| Mounted On/Off Control | 0x010F | `wall-switch` |
| Mounted Dimmable Load Control | 0x0110 | `wall-dimmer` |
| Pump | 0x0303 | not yet; easy (on/off and a level like a dimmer, with pressure or flow), few apps show pumps |
| **Closures** | | |
| Window Covering | 0x0202 | `window-covering`, `venetian-blind` |
| Door Lock | 0x000A | `door-lock` |
| Closure | 0x0230 | not yet; medium: Matter 1.5's garage doors, gates and windows, apps are only starting to support it |
| Closure Panel | 0x0231 | not yet; part of a closure (a panel or leaf), comes with it |
| **Heating, cooling and air** | | |
| Thermostat | 0x0301 | `thermostat`, `thermostat-heat-cool` |
| Fan | 0x002B | `fan` |
| Heat Pump | 0x0309 | `heat-pump` |
| Room Air Conditioner | 0x0072 | not yet; medium: the heating and cooling thermostat plus on/off and a fan |
| Air Purifier | 0x002D | not yet; medium: a fan plus filter state and air quality |
| Water Heater | 0x050F | not yet; medium: a heating thermostat plus tank state, boost and modes |
| **Sensors** | | |
| Temperature Sensor | 0x0302 | `temperature-sensor` |
| Humidity Sensor | 0x0307 | `humidity-sensor` |
| Light Sensor | 0x0106 | `light-sensor` |
| Pressure Sensor | 0x0305 | `pressure-sensor` |
| Flow Sensor | 0x0306 | `flow-sensor` |
| Air Quality Sensor | 0x002C | `air-quality-sensor` |
| Contact Sensor | 0x0015 | `contact-sensor` |
| Occupancy Sensor | 0x0107 | `occupancy-sensor` |
| Smoke CO Alarm | 0x0076 | `smoke-co-alarm` |
| Water Leak Detector | 0x0043 | `water-leak-detector` |
| Rain Sensor | 0x0044 | `rain-sensor` |
| Water Freeze Detector | 0x0041 | `water-freeze-detector` |
| Soil Sensor | 0x0045 | not yet; easy (soil moisture and temperature), hardly any app shows it |
| **Buttons and doorbells** | | |
| Generic Switch | 0x000F | `generic-switch` |
| Doorbell | 0x0148 | `doorbell` |
| Chime | 0x0146 | not yet; easy (an app's "play the chime" as a command), few apps show it |
| Audio Doorbell, Video Doorbell, Intercom | 0x0141, 0x0143, 0x0140 | not planned: need audio or video streaming |
| Camera, Floodlight Camera, Snapshot Camera | 0x0142, 0x0144, 0x0145 | not planned: need video streaming |
| **Water** | | |
| Water Valve | 0x0042 | `water-valve` |
| Irrigation System | 0x0040 | not yet; medium: several valve zones with flow |
| **Energy** | | |
| Electrical Meter | 0x0514 | `electrical-meter` |
| Solar Power | 0x0017 | `solar-power` |
| Battery Storage | 0x0018 | `battery-storage` |
| Energy EVSE (wallbox) | 0x050C | `evse` |
| Electrical Sensor, Device Energy Management, Power Source | 0x0510, 0x050D, 0x0011 | part of the energy types (a power source also of a sensor with a battery) |
| Electrical Utility Meter, Meter Reference Point, Electrical Energy Tariff | 0x0511, 0x0512, 0x0513 | not planned: a utility's meter identification and tariffs, which Nexus has no source for |
| **Appliances** | | |
| Refrigerator, Temperature Controlled Cabinet | 0x0070, 0x0071 | not planned: appliance states, programs and modes have no counterpart in Nexus |
| Laundry Washer, Laundry Dryer, Dishwasher | 0x0073, 0x007C, 0x0075 | not planned, as above |
| Oven, Cooktop, Cook Surface, Microwave Oven, Extractor Hood | 0x007B, 0x0078, 0x0077, 0x0079, 0x007A | not planned, as above |
| Robotic Vacuum Cleaner | 0x0074 | not planned, as above |
| **Media** | | |
| Speaker, Basic Video Player, Casting Video Player, Content App | 0x0022, 0x0028, 0x0023, 0x0024 | not planned: media playback and apps |
| **Controllers** | | |
| On/Off Light Switch, Dimmer Switch, Color Dimmer Switch | 0x0103, 0x0104, 0x0105 | not planned: they switch other Matter devices directly (bindings), which apps don't offer for bridges; use a button for routines |
| Control Bridge, On/Off Sensor | 0x0840, 0x0850 | not planned, as above |
| Door Lock Controller, Window Covering Controller, Thermostat Controller, Pump Controller, Closure Controller | 0x000B, 0x0203, 0x030A, 0x0304, 0x023E | not planned, as above |
| Camera Controller, Video Remote Control, Casting Video Client | 0x0147, 0x002A, 0x0029 | not planned, as above |
| **Other** | | |
| Mode Select | 0x0027 | not yet; easy (named modes both ways), but the big apps don't show it |
| **Infrastructure** | | |
| Root Node, Aggregator, Bridged Node | 0x0016, 0x000E, 0x0013 | what the bridge itself is made of |
| OTA Requestor, OTA Provider | 0x0012, 0x0014 | not applicable: firmware updates |
| Secondary Network Interface, Network Infrastructure Manager, Thread Border Router, Joint Fabric Administrator | 0x0019, 0x0090, 0x0091, 0x0130 | not applicable: network infrastructure |

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
