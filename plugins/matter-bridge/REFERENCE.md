## Device types

Each configured device becomes one bridged Matter device. Its type decides what the apps show and
which signals it has.

| Type (`type`) | In the apps | Sensors (commands) | Actuators (states) | Starts as |
|---|---|---|---|---|
| On/off light (`on-off-light`) | a light with on/off | `on-off` | `on-off` | off |
| Dimmable light (`dimmable-light`) | a light with brightness | `on-off`, `brightness` | `on-off`, `brightness` | off |
| Plug (on/off) (`plug`) | a smart plug | `on-off` | `on-off` | off |
| Window covering (lift position) (`window-covering`) | a blind or shutter with a position | `position` | `position` | position unknown |
| Thermostat (heating) (`thermostat`) | a heating thermostat | `setpoint` | `temperature`, `setpoint` | room temperature unknown, setpoint 20 °C |
| Temperature sensor (`temperature-sensor`) | a temperature sensor | | `temperature` | unknown |
| Humidity sensor (`humidity-sensor`) | a humidity sensor | | `humidity` | unknown |
| Contact sensor (door, window) (`contact-sensor`) | a contact sensor | | `contact` | closed |
| Motion (occupancy) sensor (`occupancy-sensor`) | a motion sensor | | `occupancy` | no motion |

"Unknown" is Matter's empty value: the apps show no reading rather than a made-up one; "Starts
as" is what a new device shows before Nexus sends anything.

After a restart (a config change, an update) each device shows what it showed before, although
Nexus doesn't replay values to actuators when an instance starts. matter.js stores on/off,
brightness, positions and setpoints itself. For contacts, motion, temperatures and humidity the
plugin keeps the last state Nexus sent (store keys `state:<device id>`): without it a restart
would show every door closed and then "open" it again, which starts "door opens" routines although
nothing happened, and temperatures would be unknown until Loxone happens to send again. After the
factory reset that follows removing the last app, the bridge sets every state Nexus sent in this
run again, in the order it sent them.

Sensors-only types are what start routines in Alexa ("when the front door opens, announce …").
Values without a Matter device type, such as PV power, can't be shown sensibly.

## How values convert

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
| `device` | The device's **Name** exactly as in the settings. Signal lists group the signals of one device under this name. |

A sensor for a device that isn't configured, or whose type has no such command, goes into the
error state with the reason (for example `"Hall" is a plug (on/off), which gets no brightness
commands`). An actuator in that case is refused with the same message when it is added or when
the instance starts. Renaming a device or removing it from the settings therefore shows on its
signals; change their `device` param or remove them.

## Catalog

One folder per configured device, labelled `<name> (<type>)`, with the sensors first, then the
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
  waits to be paired again, with the same code. The reset takes a fraction of a second; a request
  that still meets it is answered "the bridge is resetting … try again in a few seconds".
- **The code** (passcode and discriminator) is chosen once per instance and kept in the store
  (`pairing`). The keys and certificates of the pairings are kept there too (`matter:bridge/…`),
  so they survive restarts, config changes and updates, and travel in Nexus's backup.
- **Device identity** comes from the device's name and type. Renaming a device or changing its
  type makes a new device in every app (the old one may stay there as unresponsive until you
  remove it), and its routines have to be set up again. A config change restarts the instance; the
  pairing is kept.

## Panel

| Section | Shows |
|---|---|
| Pairing | While not paired, or while a window opened with **Open pairing window** is open: the QR code, with the manual code (as `1234-567-8901`) and when the window closes. While a paired app shares the bridge (its own window and code): a note to use the code that app shows. Otherwise "Paired: yes". If the pairing window of an unpaired bridge has closed (after 48 hours), it says so: run **Open pairing window**. During the reset after the last app was removed: "resetting". |
| Controllers | One row per paired app: its name (the fabric's label, else the vendor: Amazon Alexa, Google Home, Apple Home), its vendor id in hex and its fabric index, with a **Remove** button. |
| Devices | One row per device: name, type, the last command from an app and the last state from Nexus, each with its time. Devices with several values name the one, e.g. `temperature 20.5 °C` or `heating setpoint 21 °C` on a thermostat. The last state is the value Nexus sent, before any limit (a setpoint of 35 °C shows as sent and is shown to the apps as 30 °C). |

## Actions

| Action | Input | What it does |
|---|---|---|
| Open pairing window (`open-pairing-window`) | none | Opens a 15-minute window for another app (while not paired: restarts the 48-hour window). Answers with the manual pairing code. |
| Remove pairing (`remove-pairing`) | `fabricIndex` (1–254) | Removes that app's pairing, after a confirmation. Also offered as **Remove** on each row of the Controllers table. |

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
| "Device is unresponsive" in Alexa after it worked | Nexus or the instance is stopped, or the host's address changed; the app reconnects once the bridge runs again. A renamed device may stay as an unresponsive old one; remove it in the app. |
| A routine doesn't start | Alexa starts routines on changes only; the state actuator must change (for a contact: off → on). |
| A command does nothing | The bridge already showed that state, so no change was sent (see How values convert); wire the state actuator. |

The instance log shows matter.js's lines prefixed `matter.js:`: its notices as info, its warnings
and errors as warnings and errors, its info lines as debug. Its debug lines are not logged.

## Storage and writes

Everything the plugin keeps is in the instance's store, so in Nexus's database: the pairing code
(`pairing`), matter.js's data (`matter:bridge/<context>`, one key per storage context) and the
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

One instance uses about 40–50 MB of JavaScript heap and adds about 150–200 MB to the memory of
the Nexus process (RSS; measured with 5 and 50 devices), mostly matter.js itself and its own
engine in the plugin's worker. The plugin asks for a heap limit of 256 MB (`heapMb`). On a small
machine (1–2 GB) run a single instance; one bridge carries up to 50 devices.

## Limits

| What | Limit |
|---|---|
| Devices per bridge | 50 (Alexa's limit for one bridge) |
| Device and bridge names | 32 bytes (letters like ä count twice), unique per bridge ignoring case |
| Pairing window | 15 minutes once paired; 48 hours while not paired |
| Paired apps | in practice a handful; each app is one Matter fabric |
| Device types | the nine above; colour lights, fans, locks and cooling are not in this version |

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
