# Changelog

## Unreleased

### Plugin pages

- **Richer panels:** values with a status colour and a live countdown ("in 12:30", "for 3 min"),
  big-number tiles, notices with a link, switches and one-click buttons on rows and items. Long
  tables get a search box, sortable columns and pages of 25.
- **Actions** can answer with a QR code (or another panel part) and show their progress while
  they run.
- **Live pages:** a plugin may tell the page when its panel changed, instead of being asked every
  3 s.
- **Settings forms:** inputs for durations, times of day, colours, sliders, files and multiple
  choices, and **Find** next to fields a plugin can look up on the network (mDNS).
- For plugin authors: `Plugin.panelChanged()`, `Action.progress()`, `Actuator.run(value, { replayed })`,
  the field kinds `duration`, `timeOfDay`, `color`, `slider`, `file` and `discoverable`, and `Mdns`.
  Panel cells are now `string | { text, tone, until, since }`; tests read them with `cellText()`.
  Plugins built with this SDK still work on older Nexus versions, which get plain panels.
- **Home Assistant and MQTT:** **Find** next to the URL lists the servers and brokers that announce
  themselves on the network.
- **Fronius:** the power flow as tiles (battery charge and autonomy with a bar), the reading state
  in green or red, and a page that refreshes after every poll.

### UniFi Network plugin 0.1.0 (new)

- Connects a UniFi console through Ubiquiti's official Network Integration API (API key), and
  nothing else.
- **Presence:** whether a phone or computer is connected, the access point or switch it is on,
  and its IP address; matched by MAC address, or by name for iPhones with rotating private
  addresses.
- **Devices and ports:** online, state, firmware update, CPU, memory, uptime and uplink rates;
  port link, speed and PoE state. Statistics are only asked for devices that have such signals.
- **Commands:** restart a device and power-cycle a PoE port on a pulse (never on a value replayed
  after a start), authorize or unauthorize guests, switch a Wi-Fi network on or off, create
  hotspot vouchers.
- **Page:** a switch per Wi-Fi network, the devices with coloured states and a Restart button, PoE
  ports with Power-cycle, the connected clients with Authorize for guests. Create voucher answers
  with the code and a QR code; the newest code is also a sensor.
- **Certificates:** pin the console's self-signed certificate by its SHA-256 fingerprint (Test
  connection shows it), or accept any certificate for this console only.

### Matter bridge plugin 0.2.0

- **More device types:** colour light (RGB), dimmable plug, wall switch and wall dimmer, blind
  with slats (lift and tilt), thermostat with heating, cooling and modes, water valve, light,
  pressure, flow and air quality sensors (CO₂, PM2.5), rain sensor, water freeze detector,
  doorbell and chime (bell: a ring pulse and the sound when an app plays it).
- **A shorter type list:** Add device lists kinds of devices; close types (lights, plugs, wall
  controls, blinds, thermostats, sensors, leak/rain/frost, buttons, energy meters) are one entry
  with a second choice. The action's input changed with it: `type` is the kind (`lights`), the
  type goes in the kind's field (`light: "dimmable-light"`); see the plugin's reference.
- **Forms:** a required choice without a default says "Choose…" until one is picked, and a form
  error names the field by its label ("Kind of light: is required").
- **Energy devices:** electricity meter, solar power (PV), battery storage, wallbox (EV charger,
  with enable, current and charging mode from the apps) and heat pump.
- **Batteries:** sensors and buttons can be added with a battery level the apps show and warn on.
- **Pairing on the page:** a "Not paired yet" notice, the pairing window counting down to its end,
  green and grey for paired and closed; Open pairing window answers with the QR code. The page
  refreshes by itself on pairing, pairing windows, controllers, device changes and new commands
  and states.
- The plugin's README lists every Matter device type (up to Matter 1.6.1, as matter.js 0.18 models
  them) and whether the bridge offers it.

## 0.8.0 (2026-10-30)

Lox Nexus 0.8.0 is a complete rewrite of Nexus. It connects Home Assistant, Fronius inverters,
calendars, MQTT and more to Loxone Miniservers over Network Intercommunication, with a new web UI,
plugins that are installed and updated in the UI, and a published Docker image.

### Install

```sh
mkdir lox-nexus && cd lox-nexus
curl -fsSLO https://raw.githubusercontent.com/Multivit4min/lox-nexus/main/compose.yaml
docker compose up -d
```

Then open `http://<host>:8080/`. The image `ghcr.io/multivit4min/lox-nexus` runs on amd64 and
arm64 (e.g. a Raspberry Pi 4 or 5). Documentation: https://multivit4min.github.io/lox-nexus/

### Highlights

- **Signals and wires:** every Miniserver input and output and every plugin value is a signal. A
  wire connects a source to a target and can invert, scale, map, debounce, throttle or convert on
  the way. Signals carry a unit and a precision, and can warn when a value stops arriving.
- **Plugins:** Home Assistant, Fronius, Calendar (iCal), MQTT, Webhook, Script, InfluxDB and a
  Matter bridge for Apple Home, Google Home and Alexa. Each instance runs in its own worker
  thread and restarts by itself after a crash. Plugins are installed, updated and rolled back in
  the UI, from the built-in repository, a ZIP file or a git repository.
- **Bus Inspector:** every message live with its cause chain, and forces to pin any signal to a
  value for testing or maintenance.
- **History** charts, **backups** of the whole installation (encrypted with a passphrase), and a
  **config export** that carries plugin instances with their secrets sealed.
- **Import from Loxone Config:** signals can be read from the project on the Miniserver.
- **Plugin SDK** for your own plugins, with compatibility rules for future versions
  ([ADR 0019](docs/adr/0019-sdk-and-wire-evolution.md)). It isn't on npm yet.

### Coming from the previous Nexus (0.7.x)

- **It is a new installation.** 0.8.0 doesn't read the previous Nexus's database or export, so
  Miniservers, signals and integrations are set up again. Run both side by side while you move
  over, on different ports.
- **Docker instead of the tarball with pm2.** The previous update command
  (`…/releases/latest/download/loxone-nexus.tar.gz`) no longer finds a download, so it can't
  replace an old installation by accident.
- **The previous version stays available:** its code is on the
  [`legacy` branch](https://github.com/Multivit4min/lox-nexus/tree/legacy), and its releases
  (up to 0.7.2) remain downloadable by version.
- **Not ported yet:** the Sonos and Hue integrations.
