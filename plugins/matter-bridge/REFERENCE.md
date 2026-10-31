## Managing devices

Devices are kept in the plugin store (`devices`), not in the settings, and changed with actions on
the instance page while the bridge runs; none of them restarts the instance or touches a pairing.
Their buttons are in the Status card: **Add device** above the Devices table, **Edit** and
**Remove** on each row, **Open pairing window** in the Pairing section and **Remove** on each
controller's row.

| Action | Input | What it does |
|---|---|---|
| Add device (`add-device`) | `type`, `name`, for a door lock `allowUnlock` (default off), for sensors and buttons `battery` (default off) | Adds a device, at most 50 per bridge (Alexa's limit). Names are unique ignoring case, at most 32 bytes. The form shows **Allow unlocking** only when Door lock is chosen, and **Battery** only for sensors and buttons; neither the type nor the battery can be changed later. |
| Edit device (`edit-device`) | `device` (id), `name` | Renames a device; a door lock keeps whether it may be unlocked. Asks before saving. The **Edit** button on each row of the Devices table fills it in. The type can't change: remove the device and add a new one. If the endpoint refuses a change, the device keeps what it had. |
| Edit lock (`edit-lock`) | `device` (id), `name`, `allowUnlock` | A door lock's **Edit**: renames it and allows or forbids unlocking from the apps. Refuses a device that isn't a lock. Turning unlocking on is written to the instance log as a warning. |
| Remove device (`remove-device`) | `device` (id) | Removes a device after a confirmation, with what the bridge remembered of it. The **Remove** button on each row fills it in. |

- **Ids.** A new device gets an id from its name and a short random suffix, e.g.
  `kitchen-light-3f2a`. Its signals refer to it, and its Matter identity (endpoint, unique id,
  serial number) derives from it, so neither changes when the device is renamed.
- **Adding** shows the device to every paired app at once: a Matter controller sees it within a
  second (measured with matter.js). The Alexa app may take a minute or need **Discover devices**.
- **Renaming** keeps the device, its routines and its signals. The bridge reports the new label
  (Matter's NodeLabel) to the paired apps right away, but apps often keep the name they gave the
  device when it was added: rename it in the app too, or remove it there and discover again.
- **Removing** takes the device from every app (routines using it stop working). Its signals in
  Nexus stay, in the error state ("the bridge has no device …"), until you remove them.
- **From an older version.** Devices that the first version kept in the settings move into the
  bridge's own storage once (config version 2), with their name as id (what their signals refer
  to) and the Matter identity they had, so a paired Alexa keeps them. That happens at the first
  start, or when the settings are saved before it; either way nothing is lost.

## Device types

Each device is one bridged Matter device. Its type decides what the apps show and which signals
it has.

| Type (`type`) | In the apps | Sensors (commands) | Actuators (states) | Starts as |
|---|---|---|---|---|
| On/off light (`on-off-light`) | a light with on/off | `on-off` | `on-off` | off |
| Dimmable light (`dimmable-light`) | a light with brightness | `on-off`, `brightness` | `on-off`, `brightness` | off |
| Plug (on/off) (`plug`) | a smart plug | `on-off` | `on-off` | off |
| Dimmable plug (`dimmable-plug`) | a plug with brightness | `on-off`, `brightness` | `on-off`, `brightness` | off |
| Wall switch (on/off) (`wall-switch`) | a mounted on/off control (Matter 1.4) | `on-off` | `on-off` | off |
| Wall dimmer (`wall-dimmer`) | a mounted dimmable load control (Matter 1.4) | `on-off`, `brightness` | `on-off`, `brightness` | off |
| Window covering (lift position) (`window-covering`) | a blind or shutter with a position | `position` | `position` | position unknown |
| Thermostat (heating) (`thermostat`) | a heating thermostat | `setpoint` | `temperature`, `setpoint` | room temperature unknown, setpoint 20 °C |
| Temperature sensor (`temperature-sensor`) | a temperature sensor | | `temperature` | unknown |
| Humidity sensor (`humidity-sensor`) | a humidity sensor | | `humidity` | unknown |
| Contact sensor (door, window) (`contact-sensor`) | a contact sensor | | `contact` | closed |
| Motion (occupancy) sensor (`occupancy-sensor`) | a motion sensor | | `occupancy` | no motion |
| Tunable white light (`color-temperature-light`) | a light with brightness and white tone | `on-off`, `brightness`, `color-temperature`, `tunable-white` | the same four | off, 4000 K |
| Fan (`fan`) | a fan with speed (off, low, medium, high, or %) | `on-off`, `fan-speed` | `on-off`, `fan-speed` | off |
| Door lock (`door-lock`) | a lock | `lock` | `locked` | unknown |
| Smoke and CO alarm (`smoke-co-alarm`) | a smoke and carbon monoxide alarm | | `smoke`, `co` | normal |
| Water leak detector (`water-leak-detector`) | a leak sensor | | `leak` | dry |
| Light sensor (lux) (`light-sensor`) | an illuminance sensor | | `illuminance` | unknown |
| Pressure sensor (`pressure-sensor`) | a pressure sensor | | `pressure` | unknown |
| Flow sensor (`flow-sensor`) | a flow sensor | | `flow` | unknown |
| Rain sensor (`rain-sensor`) | a rain sensor (Matter 1.3) | | `rain` | dry |
| Water freeze detector (`water-freeze-detector`) | a frost sensor (Matter 1.3) | | `freeze` | no frost |
| Button (generic switch) (`generic-switch`) | a button for routines | | `press`, `long-press` | |

**Battery.** Sensors and buttons can be added with **Battery** on: the device then also has a
`battery` actuator, and the apps show its level (Matter's power source with a battery) and warn
when it is low. Without it the device has no battery at all, as a mains-powered one.

"Unknown" is Matter's empty value: the apps show no reading rather than a made-up one; "Starts
as" is what a new device shows before Nexus sends anything.

After a restart (a config change, an update) each device shows what it showed before, although
Nexus doesn't replay values to actuators when an instance starts. matter.js stores on/off,
brightness, colour temperature, positions, fan speeds and setpoints itself. For contacts, motion,
locks, alarms, leaks, rain, frost, measurements and battery levels the plugin keeps the last state Nexus sent (store keys `state:<device id>`): without it a restart
would show every door closed and then "open" it again, which starts "door opens" routines although
nothing happened, and temperatures would be unknown until Loxone happens to send again. After the
factory reset that follows removing the last app, the bridge sets every state Nexus sent in this
run again, in the order it sent them.

Sensors-only types are what start routines in Alexa ("when the front door opens, announce …").
Values without a Matter device type, such as PV power, can't be shown sensibly.

What the apps do with a type is up to them, and only real hardware shows it:

- **Smoke and CO alarm:** it forwards an alarm state from Nexus, for example Loxone's fire and
  water alarm; it detects nothing itself and is no replacement for a certified smoke detector.
  Alexa announces smoke and CO alarms of Matter devices as proactive notifications.
- **Water leak detector:** Amazon's list of Matter device types has no Alexa interface for it, so
  Alexa may show it without routines; Google Home, Apple Home and Home Assistant support it.
- **Door lock:** Alexa asks for its own voice code before unlocking by voice (set in the Alexa
  app); Nexus keeps no PIN codes. Unlocking from any app is refused unless **Allow unlocking** is
  on for the lock.
- **Button:** apps that support Matter buttons (generic switches) offer presses as routine
  triggers; whether Alexa does for a bridged button could not be checked without an Echo.

## How values convert

New signals suggest the unit and decimals of their value: °C with one decimal for temperatures
and setpoints, % without decimals for humidity, brightness, position, fan speed and battery, K for
color temperature, lx and hPa without decimals, and m³/h with one.

| Signal | Nexus | Matter |
|---|---|---|
| `on-off` | `true` on, `false` off | OnOff `onOff` |
| `brightness` | 0–100 %; 0 means off | LevelControl `currentLevel` 1–254 plus OnOff. A command sends the effective brightness: the level in % while on (at least 1), 0 when switched off; "on at 30 %" from off sends on and 30 once each. A state of 0 switches the light off and keeps its level; above 0 switches it on at that level. |
| `position` | 0–100 % closed (0 open, 100 closed), like a Loxone blind | WindowCovering lift position in 1/100 %. Go to sends the target, open 0, close 100, and stop the position Nexus last reported (nothing while it is unknown), so wire the current position for stop to work. A state sets the current and the target position, so the apps don't show the blind moving. |
| `temperature` | °C, e.g. `21.5` | `measuredValue` or a thermostat's `localTemperature` in 1/100 °C, limited to -273.15 to 327.67 |
| `humidity` | % | `measuredValue` in 1/100 %, limited to 0–100 |
| `contact` | `true` while **open** | BooleanState `stateValue`, which Matter defines the other way round (`true` = contact closed). The plugin flips it, so a Loxone digital input "door open" wires directly. |
| `occupancy` | `true` while motion is detected | OccupancySensing `occupied` (passive infrared) |
| `setpoint` | °C | `occupiedHeatingSetpoint` in 1/100 °C, limited to the thermostat's 7–30 °C; a value outside is shown as the nearest limit |
| `color-temperature` | Kelvin, e.g. `3000` | ColorControl `colorTemperatureMireds` (1 000 000 / K), limited to 2700–6500 K; a command comes back in steps of 10 K |
| `tunable-white` | Nexus's `tunableWhite` (temperature K, brightness %, fade time) | Colour temperature, level and on/off together; brightness 0 is off. An app's action ("on at 30 %") can change several attributes, one after the other: the light reports once, as it ends up (fade time 0), with on/off and colour temperature only if they changed. The fade time Nexus sends is not used |
| `fan-speed` | 0–100 % | FanControl `percentSetting` (commands) and `percentCurrent` (state). Off, low, medium and high from an app become 0, 33, 66 and 100 %; a speed sets the mode (up to 33 % low, up to 66 % medium, above high). On/off is the speed above 0, sent only when it changes; "on" from Nexus goes back to the last speed above 0, from Nexus or an app (kept while the bridge runs) |
| `lock` | `true` lock, `false` unlock | DoorLock lock and unlock commands, sent on every request (also when the lock already shows that state). An unlock without **Allow unlocking** is answered with FAILURE and a LockOperationError event (restricted) and reaches nothing. A timed unlock (an app's "unlock for N seconds", only with **Allow unlocking**) arrives as `false`, and after the time matter.js relocks on its own: `true` arrives, and the apps show the lock locked at once, possibly before Loxone has locked it |
| `locked` | `true` locked, `false` unlocked | DoorLock `lockState` (unknown until Nexus first sends one) |
| `smoke`, `co` | `true` while alarmed | SmokeCoAlarm `smokeState` / `coState` critical or normal, `expressedState` (smoke before CO), and the SmokeAlarm, COAlarm and AllClear events |
| `leak`, `rain`, `freeze` | `true` while a leak, rain or frost is detected | BooleanState `stateValue` (true = detected), with its StateChange event |
| `illuminance` | lux | IlluminanceMeasurement `measuredValue` = 10 000 × log10(lx) + 1; below 1 lx is 0 (too dark to measure) |
| `pressure` | hPa (mbar) | PressureMeasurement `measuredValue` in 0.1 kPa, the same number as hPa |
| `flow` | m³/h | FlowMeasurement `measuredValue` in 0.1 m³/h, at least 0 |
| `battery` | 0–100 % | PowerSource `batPercentRemaining` in half percent; `batChargeLevel` warning below 20 %, critical below 10 %, with `batReplacementNeeded` |
| `press`, `long-press` | each `true` is one press; `false` does nothing | Switch events: InitialPress, ShortRelease and MultiPressComplete (two presses within 300 ms count as a double press); a long press holds for 1.2 s: InitialPress, LongPress, LongRelease. Presses are events, not states: nothing is remembered or replayed |

A command from an app updates the bridge at once (Matter needs that) and goes to the sensor. A
state from Nexus updates the bridge and is never sent back as a command, so a sensor and an
actuator of the same device can both be wired to Loxone without a loop. Nexus drops a value equal
to the previous one, and the bridge only reports changes: a command that matches what the bridge
shows (Alexa says "on" while it shows on) sends nothing. Wire the state actuator as well, so the
bridge shows what Loxone did.

A thermostat stays in heat mode. A mode change from an app (off, auto) is accepted by the bridge
but not passed on; there is no sensor for it in this version.

## Sensor and actuator params

Every sensor and actuator has one param:

| Param | Description |
|---|---|
| `device` | The device's id, as the Devices table shows it (e.g. `kitchen-light-3f2a`). Signal lists group the signals of one device under it. |

A sensor for a device that doesn't exist, or whose type has no such command, goes into the error
state with the reason (for example `"Hall" is a plug (on/off), which gets no brightness
commands`); it follows devices removed while it runs. An actuator does the same, and each command
it gets meanwhile fails with that message. Renaming never affects signals.

## Catalog

One folder per device, labelled `<name> (<type>)`, with the sensors first, then the
actuators, e.g. `Kitchen light: on/off from controllers` and `Kitchen light: brightness % to
controllers`. Every entry can be added as it is.

## Pairing

The first app pairs while the bridge is not paired: in the Alexa app **Devices → + → Add Device
→ Matter** (in Google Home, Apple Home or Home Assistant: add a Matter device), then scan the QR
code from the instance page or choose to type the 11-digit code.
Alexa and Apple warn that the bridge is not certified (it uses the Matter test vendor id
`0xFFF1`); continue anyway. The devices then appear with their names.

- **A second app (multi-admin).** Run **Open pairing window**: for 15 minutes the bridge accepts
  another pairing with the same code, and the panel shows the QR code with the time it closes.
  The answer shows the code too. Alternatively, share the bridge from an app that already has it
  (the apps call it sharing or linking a Matter device); that app then shows a code of its own.
  While that window is open the panel says so instead of showing the bridge's code (which doesn't
  work then), and **Open pairing window** refuses until it has closed.
- **Removing an app.** The Controllers table has a **Remove** button per app (or run **Remove
  pairing** with the fabric index the table shows). The bridge leaves that app's fabric at once;
  the app loses all the bridge's devices and its routines with them. Removing the bridge in the app
  itself works as well.
- **Removing the last app** resets the bridge to factory settings: it forgets every pairing and
  waits to be paired again, with the same code. The reset puts every device back to how it was
  created; the bridge then sets their names, each lock's **Allow unlocking** and the states Nexus
  sent again. The reset takes a fraction of a second; a request
  that still meets it is answered "the bridge is resetting … try again in a few seconds".
- **The code** (passcode and discriminator) is chosen once per instance and kept in the store
  (`pairing`). The keys and certificates of the pairings are kept there too (`matter:bridge/…`),
  so they survive restarts, config changes and updates, and travel in Nexus's backup.
- **Device identity** comes from the device's id (see Managing devices): renaming keeps it, removing
  and adding a device makes a new one. A config change restarts the instance; the pairing is kept.

## Panel

| Section | Shows |
|---|---|
| Pairing | While not paired, or while a window opened with **Open pairing window** is open: the QR code, with the manual code (as `1234-567-8901`) and when the window closes. While a paired app shares the bridge (its own window and code): a note to use the code that app shows. Otherwise "Paired: yes". If the pairing window of an unpaired bridge has closed (after 48 hours), it says so: run **Open pairing window**. During the reset after the last app was removed: "resetting". |
| Controllers | One row per paired app: its name (the fabric's label, else the vendor: Amazon Alexa, Google Home, Apple Home), its vendor id in hex and its fabric index, with a **Remove** button. |
| Devices | One row per device: name, id, type, the last command from an app and the last state from Nexus, each with its time, and the **Edit** and **Remove** buttons. Without devices: "No devices yet: use Add device". Devices with several values name the one, e.g. `temperature 20.5 °C` or `heating setpoint 21 °C` on a thermostat. The last state is the value Nexus sent, before any limit (a setpoint of 35 °C shows as sent and is shown to the apps as 30 °C). |

## Actions

| Action | Input | What it does |
|---|---|---|
| Open pairing window (`open-pairing-window`) | none | Opens a 15-minute window for another app (while not paired: restarts the 48-hour window). Answers with the manual pairing code. |
| Remove pairing (`remove-pairing`) | `fabricIndex` (1–254) | Removes that app's pairing, after a confirmation. Also offered as **Remove** on each row of the Controllers table. |

Add, Edit and Remove device are described under Managing devices.

## Networking

Matter finds devices by mDNS and talks to them over UDP, mostly IPv6. Nexus must run with host
networking (`network_mode: host`, as in the provided `compose.yaml`); Docker's bridge network
hides mDNS and IPv6 link-local addresses.

- **Same network segment.** The Echo (or Google hub, Apple TV, Home Assistant) and the Nexus host
  must be in the same VLAN. mDNS does not cross VLANs unless a reflector (an mDNS repeater on the
  router) is set up, and even then Matter often fails.
- **IPv6.** IPv6 must be enabled on the host's network interface. Link-local addresses (`fe80::`)
  are enough; no IPv6 from your provider is needed.
- **Ports.** UDP 5540 (or the configured port) and UDP 5353 (mDNS) inbound on the host's firewall
  (`ufw allow 5540/udp`, `ufw allow 5353/udp`; in firewalld, the zone of that interface). The
  bridge shares port 5353 with avahi on the host; that is fine.
- **Wi-Fi.** Some access points filter multicast between Wi-Fi and wired clients, or convert it
  ("multicast enhancement", "IGMP snooping" without a querier, "client isolation"). If the Echo is
  on Wi-Fi and pairing never finds the bridge, try turning those off.
- **Several Matter programs on one host** (Home Assistant's Matter Server, Matterbridge, a second
  bridge instance) each need their own UDP port.

## Troubleshooting

| Symptom | What to check |
|---|---|
| The instance doesn't start: "UDP port 5540 is in use" | Another Matter program listens there; choose another **UDP port**. |
| The app searches and never finds the bridge | Same VLAN? IPv6 on the host? Host networking? Firewall open for UDP 5353 and the port? Wi-Fi multicast filtering? Is the pairing window still open (the panel says so)? |
| "Device is unresponsive" in Alexa after it worked | Nexus or the instance is stopped, or the host's address changed; the app reconnects once the bridge runs again. A device removed in Nexus may stay as an unresponsive one; remove it in the app. |
| A routine doesn't start | Alexa starts routines on changes only; the state actuator must change (for a contact: off → on). |
| A command does nothing | The bridge already showed that state, so no change was sent (see How values convert); wire the state actuator. |
| Stopping the instance takes 3 s, with "didn't close within 3 s" in the log | A paired app (an Echo) doesn't answer, e.g. it is unplugged. The bridge waits at most 3 s for it, then writes what is pending and stops. |

The instance log shows matter.js's lines prefixed `matter.js:`: its notices as info, its warnings
and errors as warnings and errors, its info lines as debug. Its debug lines are not logged.

## Storage and writes

Everything the plugin keeps is in the instance's store, so in Nexus's database: the pairing code
(`pairing`), the devices (`devices`), matter.js's data (`matter:bridge/<context>`, one key per storage context) and the
remembered states (`state:<device id>`). Nothing is written to files.

Fabrics, sessions, access control, commissioning data, endpoint numbers and the pairing code are
written at once. Device states (the attributes matter.js stores, and the remembered states) are
merged: changes within 1.5 s become one write per key, and a stop writes what is pending. A crash
loses at most the last 1.5 s of device states, never a pairing.

Measured with the plugin's tests (store writes):

| What | Writes |
|---|---|
| First start with 4 devices | 11 |
| Pairing one app | 16 |
| 10 on/off commands from an app | 1 |
| 10 contact changes and 10 temperatures from Nexus | 2 |
| A blind reporting 20 positions within 2 s | 2 (20 without merging) |

## Memory

One instance uses about 45–55 MB of JavaScript heap and adds about 180 MB (5 devices) to 230 MB
(50 devices of all types) to the memory of the Nexus process (RSS), mostly matter.js itself and
its own engine in the plugin's worker. The plugin asks for a heap limit of 256 MB (`heapMb`). On a small
machine (1–2 GB) run a single instance; one bridge carries up to 50 devices.

## Limits

| What | Limit |
|---|---|
| Devices per bridge | 50 (Alexa's limit for one bridge) |
| Device and bridge names | 32 bytes (letters like ä count twice), unique per bridge ignoring case |
| Pairing window | 15 minutes once paired; 48 hours while not paired |
| Paired apps | in practice a handful; each app is one Matter fabric |
| Device types | the fifteen above; colour (hue) lights, cooling, garage doors and air purifiers are not in this version |

## Security notes

- While a pairing window is open, anyone on the same network who knows or guesses the code can
  pair and then switch the devices of this bridge. The window opens only while nothing is paired
  or after **Open pairing window**, and closes after 15 minutes.
- The pairing code is shown only on the instance page and in the action's answer, to logged-in
  users; it is never written to the log.
- Pairing keys live in Nexus's database and its encrypted backup. Restoring a backup on a second
  machine while the first one still runs puts two bridges with the same identity on the network;
  stop one of them.
- Every paired app can switch every device of the bridge. Put devices that must not be switched
  by voice into no bridge, or only as sensors.
- A door lock in the bridge can be locked by every paired app and anyone who can talk to them.
  Unlocking is refused unless **Allow unlocking** is on; with it on, an app's own protection
  (Alexa's voice code) is all that stands between a voice command and an open door. Wire the lock
  request to Loxone only where that is acceptable.

## Development

```
npm run build -w @lox-nexus/plugin-matter-bridge   # dist/plugin.js (~6.5 MB) and dist/THIRD-PARTY-LICENSES.txt
node --conditions=@lox-nexus/source --import tsx --test "plugins/matter-bridge/src/**/*.test.ts"
```

- `@matter/main` (matter.js) is pinned to exactly `0.18.0`; an update is a deliberate step,
  together with the Matter controller plugin. The bundle is not minified (matter.js relies on
  class names), replaces matter.js's Bun SQLite driver with a stub, and lists the licenses of all
  bundled packages (matter.js: Apache-2.0) in `dist/THIRD-PARTY-LICENSES.txt`.
- matter.js is configured in code: its storage is the plugin store (one store key per storage
  context, `matter:<node>/<context path>`, longer keys shortened with a hash), it has no file
  system, it doesn't trap process signals, and its log goes to the instance log without the
  ASCII-art QR code.
- matter.js reads `~/.matter/config.json` and `MATTER_*` settings when it is loaded, if they
  exist; Nexus creates neither, and a plugin worker's environment is empty. (Turning this off
  would need matter.js's Node.js configuration loaded before matter.js itself, which a bundle and
  the tests can't guarantee.)
- The tests pair the bridge with a matter.js controller in the same process over UDP on free
  ports, with mDNS on the loopback interface (`mdns.networkInterface` = `lo`), so `npm test`
  doesn't announce test bridges to the LAN.
