# Changelog

## Unreleased

### AI agents (MCP)

- AI agents such as Claude Code connect to Nexus over the Model Context Protocol at `/mcp`, with
  an **access token** from **Users and access**: they read the installation (an overview in one
  call, signals, wires, the bus, the system status).
- With the **configure** permission, agents set up Miniservers, signals and wires, and connect
  plugin signals to a Miniserver in one step (find in the catalog, plan, connect). They say what to create in Loxone
  Config and compare objects read from it with Nexus. Deleting takes a confirmation.
- With the **operate** permission, agents force values (at most 24 hours, with a reason), send
  single values and run plugin actions (actions that ask you first ask them too), and set up
  plugin instances, which run code; you enter their secrets on the instance's page.
- Agents also read plugin pages, logs and the value history, and offer four recipes (MCP prompts):
  connect a plugin to a Miniserver, take over signals from Loxone Config, diagnose a signal,
  review the installation.
- Tokens are shown once, don't expire, and end when revoked or when the user's password changes.
  Agents never see or send secrets. Guide: AI agents (MCP).
- **Recent activity** on the Access tokens tab lists what your agents changed or did, with the
  token, the arguments and whether it worked.
- Restoring a backup now logs everyone out and ends all access tokens, so revoked ones don't come
  back.

### Security

- Plugin signal settings marked secret (by third-party plugins; the bundled ones have none) are no
  longer shown by the API and are sealed in config exports like secret plugin settings; editing a
  signal keeps them.
- AI agents never see a stored secret (plugin settings, signal settings, Miniserver passwords),
  even when a plugin writes one into its status or an error: it shows as `‹secret›`.
- The web UI can't be framed by other sites, and answers carry `nosniff` and a same-origin
  referrer policy. Files starting with a dot are never served from the web folder.

### Users

- **Users and access** in the user menu: add users, set another user's password (they are logged
  out everywhere) and delete users, each confirmed with your own password. Nobody deletes their
  own account, so one always remains. Every user can do everything; there are no roles.
- The users page shows when each account last logged in.

### Plugin pages

- **Richer panels:** values with a status colour and a live countdown ("in 12:30", "for 3 min"),
  big-number tiles, notices with a link, switches and one-click buttons on rows and items. Long
  tables get a search box, sortable columns and pages of 25.
- **Actions** can answer with a QR code (or another panel part) and show their progress while
  they run.
- **"Signals" buttons:** a panel row or item can point at its node in the catalog (a client, a
  device); its **Signals** button opens just that node's signals to add or connect, instead of
  searching the whole catalog. The UniFi plugin has them on clients, devices, ports and Wi-Fi
  networks.
- **Headline tiles** stand on the page above the Status card, and times such as the last poll read
  "12 s ago" (the exact time on hover). Live times are corrected for how far the server's clock is
  off from the browser's; the System page shows that offset and how to fix it. Long values in status lists wrap on phones.
- **Manage menu:** an instance's Start, Restart, Stop and Delete are one **Manage** menu at the top
  right of its page, with **Stored data…**: what the plugin keeps between restarts, key by key with
  its size and the value on request. **Clear all data** wipes it as a whole: a running instance is
  stopped, wiped and started again, so it never runs on half of its data. Values can't be edited.
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

### Documentation

- **A plugin tutorial** that takes someone who has never seen Nexus to a working plugin: set up,
  an empty plugin, settings with Test connection, sensors, an actuator, status, catalog and
  panel, tests, and installing from a ZIP file. Its code is the tested `examples/smart-plug`
  plugin, with a fake plug (`npm run fake-plug -w @lox-nexus/example-smart-plug`) to run it
  against without hardware.
- **The plugin guide is one page per topic** (lifecycle, settings, sensors, actuators, catalog,
  panel, webhooks, and so on) instead of one long page, and *Writing plugins* starts with an
  overview of the words and what to read when.
- **The SDK reference has one page per class**, with topics (plugin, settings form, catalog and
  panel, watching, lifetimes), generated from the SDK's comments.

### Scheduler plugin 0.1.0 (new)

- Sends values at set times. Each schedule is a sensor: a **pulse** at each run, a **window** that
  is on between two times (22:00–06:00 crosses midnight), a number, on/off value or text in
  **steps** (07:00 Mon–Fri → 21, 22:00 daily → 18), or the **next run** as minutes from now, Unix
  time or Loxone date and time.
- **Value steps** are a state: at start and after a restart they send the value of the latest step
  that passed. Each step has its own trigger; a moment two steps share belongs to the later one.
  A single step reaches its target only once, since Nexus doesn't send an unchanged value again.
- Triggers are a time of day on chosen weekdays, or a 5-field **cron expression** (ranges, lists,
  steps, names, `@daily` and the like; day of month OR day of week as in Vixie cron), in the
  installation's time zone or one set for the instance. Invalid expressions, empty weekday lists
  and windows that open and close at the same time are refused when saved; errors in steps name the
  step.
- **Daylight saving:** a time skipped in spring runs at the first minute after the gap, one that
  happens twice in autumn runs once; hourly and every-few-minutes schedules follow real time.
- **Random offset** of up to ± 2 hours per run, e.g. for presence simulation; kept across restarts,
  and it never reorders runs or steps, so a window can't close before it opens.
- **Restarts:** a pulse missed by at most 5 minutes runs once at the start, older ones are
  skipped, and one that was switched off, skipped or passed before an edit never runs late; windows
  and value steps work out their state from the clock; a pulse never comes back as true. A clock
  set back starts the schedules over from the new time instead of silencing them.
- **Actuators:** switch all schedules or a group off (windows send false), and skip the next run;
  both survive restarts, and a skip replayed after a start is ignored.
- **Page:** switches for all schedules and each group, a table of schedules with the next run
  counting down, the last run and the state, and Run now, Skip next and Next runs on each row.
  **Next runs** also previews a cron expression or time before you use it.

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
- **Page:** a switch per Wi-Fi network, the devices with coloured states and a Restart button, the
  switch ports, the connected clients with Authorize for guests. Create voucher answers
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
