# Evaluation: connecting to the Miniserver other than through ICI

Status: evaluation for the owner's decision, 2026-10-28. Nothing here is built. The recommended
direction is drafted as ADR 0016 (Proposed).

Lox Nexus talks to Miniservers through Network Intercommunication (ICI, UDP), and it reads the
Loxone Config project over FTP to import ICI signals. This document looks at the other ways a
Miniserver can exchange data. For each it covers what it would take, what it would be worth, and
what to build first.

Statements about Loxone behaviour come from Loxone's public documentation ("Communicating with
the Miniserver", "Structure File", the Knowledge Base) and from common knowledge of the Miniserver.
Nothing was checked against the test Miniserver for this evaluation. Points that need a check are
marked **(verify)** and collected in the "To verify" section at the end.

## Summary

- **Build a first-party "Loxone controls" plugin** on the Miniserver's WebSocket API (the one the
  Loxone app uses), in three steps: read states, then send commands, then colours and moods. It is
  the only option that removes per-signal setup in Loxone Config. It also reaches states that ICI
  only sees when someone wires them, has rooms and categories for a catalog, and doesn't count
  against the 35 msg/s intercommunication limit. Loxone documents the API for third-party clients,
  so it is less risky to maintain than the reverse-engineered ICI.
- **Write documentation only, no code**, for Miniserver → Nexus over HTTP. A Virtual Output that
  calls the existing **webhook plugin** already works.
- **Defer** the Virtual HTTP Input (the Miniserver polls Nexus) and importing Loxone statistics.
  Both can be built as plugins on today's SDK if users ask for them.
- **Skip** Virtual UDP inputs and outputs, and HTTP requests per value to Virtual Inputs. ICI
  already does what they do, better typed, and the WebSocket channel covers Virtual Inputs.
- **ICI stays the primary path** (ADR 0005 is unchanged). It is the only way to feed typed values
  (Smart Actuator RGBW, tunable white, T5) into the program's logic, and to read values that are
  not visualised.
- Encrypted ICI beyond receiving is parked by the owner's decision (`docs/backlog.md`). This
  evaluation doesn't change that, and none of the options depends on it.

## Where things stand today

| Path | Direction | Status |
|---|---|---|
| ICI (UDP, `packages/ici`, `packages/loxone`) | both | built; plain both ways, encrypted receiving only |
| Loxone Config project over FTP (`project/`) | read once | built; imports ICI peers and packet ids |
| Webhook plugin (`/hook/<instance>/<hook>`) | anything → Nexus | built; any HTTP caller, including a Miniserver Virtual Output |

## The options

### 1. WebSocket API with the structure file (the app's interface)

**How it works.** Nexus opens `ws://<miniserver>/ws/rfc6455` with the subprotocol
`remotecontrol` and logs in as a Miniserver user:

1. Key exchange: fetch the Miniserver's RSA public key, then send a session AES key encrypted with
   it.
2. Token login: `getkey2` for the user's salt and hash algorithm (SHA-1 or SHA-256), then
   `getjwt` for a token, sent encrypted. Later connections log in with `authwithtoken`, and the
   token is refreshed before it expires.
3. Download `LoxAPP3.json` (the structure file), or keep a cached copy if its `lastModified` is
   unchanged.
4. Send `enablebinstatusupdate`. The Miniserver then pushes binary event tables: value events
   (state UUID plus a double, 24 bytes each), text events, and a few others (daytimers, weather).
   It also sends an "out of service" notice before it restarts.
5. Commands are `jdev/sps/io/<control uuid>/<command>`, for example `On`, `Off`, `Pulse`, a dimmer
   value, `FullUp`, `manualPosition/40`, `changeTo/<mood>` on a Lighting Controller,
   `hsv(...)` or `temp(...)` on a colour picker. Each command gets a JSON answer with a code.
   Controls marked `isSecured` also need the visualisation password.

**The structure file** (looked at the owner's copy for its shape only). It is about 240 KB, with
175 controls, 158 subcontrols, about 1,600 state UUIDs, 22 rooms, 24 categories, and 44 controls
with statistics. Each control has `name`, `type`, `uuidAction`, `room`, `cat`, `states` (state
name → UUID), `details` (e.g. a value `format` with the unit), optional `subControls`, and
`statistic`. Control types in that file include `LightControllerV2` (with `Dimmer`,
`ColorPickerV2` and `Switch` subcontrols), `Jalousie`, `IRoomControllerV2`, `Meter`,
`InfoOnlyAnalog`/`InfoOnlyDigital`, `PresenceDetector`, `Switch`, `Pushbutton`, `Slider`, `Wallbox2`,
`EnergyManager2` and audio zones. `msInfo` gives the Miniserver type (Gen1, Gen2, Go). The file also
holds personal data (owner, address, coordinates, users), so the plugin must keep it inside the
worker. Only the parts the catalog needs may leave it.

**Setup in Loxone Config.** Create one user for Nexus once, and give it rights to the rooms or
controls it may see and operate. Nothing per value. **Only visualised controls are in the structure
file** ("Use in user interface"). A value that lives only inside the program (a formula output, a
block input) must be visualised, for example as a virtual state, or stays an ICI value. Whether the
structure file is filtered by the user's rights is **(verify)**.

**What Nexus builds.** A first-party plugin, `plugins/loxone-controls` (the id `loxone` is reserved
for the core), that imports only the SDK. Each class below gets its own file:

| Folder | Classes |
|---|---|
| `connection/` | `LoxoneSocket` (one session: key exchange, login, one command in flight at a time because answers are matched by the echoed command), `CommandCipher` (RSA + AES with salt rotation), `TokenLogin` (`getkey2`, hashing, `getjwt`, `authwithtoken`, `refreshjwt`), `EventFrameDecoder` (binary headers and event tables, checked lengths, never throws), `LoxoneConnection` (keeps one session open: backoff from 1 s to 60 s, keepalive, out-of-service notice, never retries refused credentials) |
| `structure/` | `StructureFile` (zod for the subset the plugin uses, with a size cap), `StructureIndex` (state UUID ↔ control and state name; room and category names), `StateStore` (latest value per state UUID, events per UUID like Home Assistant's `EntityStore`) |
| `catalog/` | `ControlCatalog`: room ▸ category ▸ control ▸ states and commands, with current values and the unit taken from `details.format` |
| `sensors/` | `NumberState`, `SwitchState` (a double that isn't 0 is true), `TextState`, later `ColorState` (colour picker text → `rgbw`/`tunableWhite`) |
| `actuators/` | `Command` (a text value goes out as the raw command, works for every control type), then typed ones: `Switch`, `Pulse`, `Dimmer`, `BlindPosition`, `Mood`, `Colour`, `VirtualInput` (a value to a Virtual Input by name, which also works for inputs that aren't visualised) |
| | `LoxoneControlsPanel`: connection, user, token valid until, structure date, number of controls, events per second |

Params name the control's `uuidAction` and the state name (`{ control, state }`), not the state UUID
or the control name. Signals therefore survive renaming and moving a control in Loxone Config, and
the catalog stays readable. A state that has disappeared from the structure becomes the signal's
error, which the SDK already supports.

**How it fits the model.** Every state is a plugin sensor, so it is an ordinary signal: wires,
transforms, forces, history (S1/S2), watching plugins (S3) and the InfluxDB export (S4) work
without changes. Commands are actuators, so wires, forces and `result` messages with durations work
too. Topics are plugin topics (`loxone-controls/<instance>/sensor/<slug>`), not `loxone/<slug>/…`.
No boundary changes are needed. The plugin uses Node's built-in `WebSocket` and `node:crypto`, like
the Home Assistant plugin, and has no runtime dependency.

**Security.**
- **User.** A dedicated Miniserver user, not an admin, with rights only to what Nexus should see
  or operate, and no FTP right. This user is not the FTP import login. Nexus can do exactly what
  this user can do in the app.
- **Storage.** The password is a secret config field: write-only in the API, stored in the
  database (mode 0600) and in the encrypted backup (ADR 0014). The token lives in the plugin
  store, which is not exposed by the API and is in the backup, so restarts reuse it instead of
  creating new tokens on the Miniserver. Users can see and revoke tokens in Loxone Config.
- **Transport.**
  - On `ws://` the login is protected by Loxone's own command encryption. State updates and
    plain commands travel in cleartext on the LAN, the same exposure as unencrypted ICI and better
    than FTP, which sends its password in cleartext.
  - Commands can also be sent fully encrypted (`fenc`), at some cost per command.
  - `wss://` works on Gen2 only, and its certificate is issued for Loxone's dyndns names rather
    than a LAN address **(verify)**. TLS is left out of the first step.
- **Refused logins.** The Miniserver blocks an address after repeated failed logins. That would
  cut Nexus' ICI traffic too, because it is the same address. A refused password is therefore never
  retried, as with Home Assistant's ip_ban: at start the instance goes to `error`, later it is
  `degraded` until the config changes. A refused token falls back to the password once. Tests
  never try a wrong password against the real Miniserver.
- **Secured controls** (visualisation password) are left out at first. They would need a second
  secret and are the controls where a wrong automatic command hurts most (doors, alarms).

**Limits and performance compared with ICI.**
- **Load limit.** The 35 msg/s limit is for intercommunication. WebSocket traffic doesn't count
  against it, and Loxone documents no per-client message limit. Moving read-only values from ICI
  to the WebSocket lowers the ICI load that Nexus shows.
- **Events.** Events are pushed on change. Whether the Miniserver coalesces fast values the way
  it does for ICI (about every 500 ms) is unmeasured **(verify)**, and so is the latency; it is
  expected to be similar to ICI, which echoed in about 30 ms. The initial state dump is small: about
  1,600 states × 24 bytes ≈ 40 KB, plus text states.
- **Commands.** Each command waits for its answer, so they run one at a time per connection. That
  suits commands from people and automations, not high-rate streams. The `Throttle` transform on
  the wire is the guard.
- **Value types.** Only doubles and text. A colour picker reports `hsv(h,s,v)` or `temp(b,k)` text,
  which the plugin converts to `rgbw`/`tunableWhite`. The Smart Actuator types and T5 have no
  equivalent: to feed those into function blocks as typed values, ICI stays the way.
- **Connections.** The Miniserver allows a limited number of concurrent clients, and fewer on Gen1
  **(verify)**. The plugin uses one per instance.

**Meaning, not only transport.** A command over the WebSocket acts like a tap in the app. It goes
through the control's logic and rights, and it is recorded as an action of the Nexus user. For
example, a blind moved this way counts as manual and may pause automatic shading. An ICI value is
data into the program, and the program decides what it means. Both are useful, but they are not
interchangeable, and the docs must say so.

**Robustness.**
- Every "save to Miniserver" restarts the program. The Miniserver sends the out-of-service notice
  and drops the connection, and afterwards the structure may have changed. The plugin reconnects
  with backoff, compares `lastModified`, reloads and re-resolves its sensors, and reports states
  that are gone.
- Tokens expire and are refreshed. A token that was revoked in Loxone Config leads to one fresh
  login with the password.
- Firmware changes add control types and occasionally replace them (`LightController` became
  `LightControllerV2`, `IRoomController` became `IRoomControllerV2`). The generic state sensors and
  the raw `Command` actuator work for any type. Only typed actuators and catalog niceties follow
  firmware.
- Gen1 and Gen2 run the same API. Gen1 has no TLS, is slower and may report SHA-1 in `getkey2`.
  Both algorithms are handled.
- Health is better than ICI's: an open, authenticated connection with keepalive, rather than
  "a packet arrived in the last 10 minutes".

**Testability.**
- A `FakeLoxoneMiniserver` (`ws` on 127.0.0.1, test-only, like `FakeHomeAssistant`) generates an
  RSA key per run and serves a synthetic structure file. It covers:
  - login with SHA-1 and SHA-256
  - token reuse and refresh with `mock.timers`
  - a refused password (no further attempts)
  - out-of-service followed by a changed structure
  - malformed and truncated binary frames
  - command codes 200, 401, 403 and 500
- Fixtures are synthetic. The owner's structure file is never copied into the repository.
- A live test, read-only, runs only when `LOXONE_WS_HOST`, `LOXONE_WS_USER` and
  `LOXONE_WS_PASSWORD` are set and the owner has agreed. Command tests against the real Miniserver
  need the owner's OK and controls he names, like the Home Assistant live actuator test in the
  backlog.

**Licensing and terms.** Loxone publishes the WebSocket API and the structure file format for
third-party clients. Implementing a client needs no licence. Write the client fresh from Loxone's
documents. The plugin is MIT (ADR 0015), so code from GPL clients must not be copied in. MIT or
Apache-licensed clients can serve as a reference, with attribution if anything is taken. Use
"Loxone" only to name what the plugin connects to, with no logo and nothing that suggests
endorsement. This is not legal advice.

**Cost.** About the size of the Home Assistant plugin: 1,500–2,500 lines of source and about 1,000
lines of tests over the three steps. The maintenance follows Loxone's documented API and its
control types. The support burden is predictable:
- "my control is missing": not visualised, or no rights
- "Nexus got locked out": failed logins
- "it reconnects after every save": expected
- "the blind stopped auto-shading": command semantics

### 2. Virtual Inputs fed over HTTP

**How it works.** `GET http://<miniserver>/dev/sps/io/<virtual input name>/<value>` with a
Miniserver login, per value. Virtual Text Inputs take text.

**Setup.** One Virtual Input per value in Loxone Config, named uniquely and wired in. This is the
same effort per value as an ICI input.

**Security.**
- Each request authenticates. Basic auth sends the password in cleartext on every request.
  Whether firmware 17.2 still accepts it is **(verify)**.
- Token auth over HTTP exists, but it needs the same token machinery as option 1.
- HTTPS is Gen2 only, with the same certificate question as option 1.

**Limits.** No ICI load. One TCP connection and one authentication per value, so it suits slow
values only. Throughput on Gen1 is low **(verify)**. The values are digital, analog and text; there
are no Smart Actuator types.

**Verdict: skip as a transport of its own.** The same command (`jdev/sps/io/<name>/<value>`) goes
over the authenticated WebSocket of option 1 with no login per value. The `VirtualInput` actuator in
option 1 covers it for users who prefer Virtual Inputs, for example because the values then show in
the app with their own statistics.

### 3. Virtual UDP Input (Nexus sends text, the Miniserver parses it)

**How it works.** Nexus sends plain text, such as `pv=1234`, to a UDP port the Miniserver listens
on. A Virtual UDP Input Command per value recognises it (`pv=\v`).

**Setup.** One input per port and one command with a recognition pattern per value. That is more
work per value than ICI, and an error in a pattern fails silently.

**Security.** None. Anyone on the LAN can send, and the only filter is the sender's address.

**Limits.** No ICI load, no acknowledgement, no heartbeat. Numbers and on/off only, parsed from
text.

**Verdict: skip.** ICI does the same with types, a packet id instead of a parse pattern, health,
the import from Loxone Config and resends, all already built. The only advantage, not counting
against the limit, is better served by option 1 for anything visualised.

### 4. Virtual Outputs: the Miniserver calls Nexus

**HTTP (Virtual Output → webhook plugin).** A Virtual Output with the address of Nexus, and
Virtual Output Commands such as `/hook/<instance>/<hook>?v=<v>` (on change, or separate commands
for on and off).
- **Builds nothing.** The webhook plugin already accepts calls with a token: Bearer header,
  `X-Webhook-Token`, or `?token=`. It turns them into triggers, numbers, text and switches.
- **Setup.** One Virtual Output, then one command per value.
- **Security.**
  - The token goes in a header if the Virtual Output Command can set one, otherwise in the query
    **(verify)**.
  - HTTPS to Nexus works only if the Miniserver supports `https://` addresses in Virtual Outputs
    (Gen2) **(verify)**, and Nexus then needs a certificate the Miniserver accepts.
  - On plain HTTP the token travels in cleartext on the LAN.
- **Limits.** No ICI load. One HTTP request per change, queued by the Miniserver. Only `<v>` (the
  value) and fixed text.
- **Verdict: document it** as a guide page "Miniserver → Nexus over HTTP" (no code). It is the
  natural path for events into plugins that ICI can't reach, for example when the Miniserver should
  trigger a webhook-style flow without a Nexus signal in between.

**UDP (Virtual UDP Output).** The Miniserver sends text to a UDP port on Nexus.
- **Verdict: skip.** Nexus would need a text-parsing UDP listener plugin, with no security and
  fewer types than ICI outputs, which Nexus already receives and discovers.

### 5. Virtual HTTP Input: the Miniserver polls a URL Nexus serves

**How it works.** The Miniserver fetches a URL on a fixed cycle (seconds to minutes). One Virtual
HTTP Input Command per value extracts a number from the answer (`\i"pv":\i\v`).

**What Nexus would build.** A small plugin, on today's SDK: `watches` (S3) gives it the values of
signals the user picks, and `this.http.route()` serves them as text or JSON at
`/hook/<instance>/values`. The URL carries a token.

**Setup.** One input, then one command with a recognition pattern per value. The cycle means the
latency is the polling interval.

**Limits.** No ICI load and no state in the Miniserver. It suits many slow values (weather,
prices, daily totals) on an installation close to the ICI limit.

**Verdict: defer.** ICI with resends turned off covers the same need with types and lower
latency. Build it only if a user hits the ICI limit with slow values. It is also a good example for
a community plugin, because it needs no core change.

### 6. Other read-only sources

- **Structure file over FTP.** `LoxAPP3.json` is already in the `/prog` archive the import
  downloads. It gives names, rooms and categories without a WebSocket, but no values. That is only
  useful as a catalog preview, and option 1 gets the same file for its own user. **Skip.**
- **Room and category for ICI signals.** If the project XML gives intercommunication inputs and
  outputs (`HItcIn`, `HItcOut`) a room or category reference **(verify)**, the existing import could
  carry them. ICI signals could then be grouped by room. This is a small, separate improvement to
  the importer, independent of everything else here.
- **Statistics.**
  - Controls with `statistic` record values on the Miniserver. Older firmware serves them as
    binary files (`binstatisticdata/<uuid>/<month>`). Newer firmware has a second, less
    documented statistics format **(verify)**.
  - The value is a one-off backfill of Nexus history or InfluxDB with years of data. The cost is
    a format per firmware.
  - **Defer** until option 1 exists. It would be a feature of that plugin, using the same login.
- **Log files** (`def.log` over FTP) and system messages. The WebSocket's message center covers
  system messages better, live. **Skip** log files. System messages could become sensors of
  option 1 later.
- **Modbus TCP** (the Miniserver as a Modbus client polling Nexus as a server). It needs one
  register per value in Loxone Config, polls, and has no advantage over ICI. **Skip.**

## Comparison

| | ICI (today) | WebSocket API | HTTP → Virtual Input | Virtual UDP Input | Virtual Output → webhook | Virtual HTTP Input (poll) |
|---|---|---|---|---|---|---|
| Direction | both | both | Nexus → MS | Nexus → MS | MS → Nexus | Nexus → MS |
| Setup per value in Config | peer input/output (import helps) | none for visualised controls | Virtual Input | command + pattern | command | command + pattern |
| Reaches non-visualised values | yes | no | n/a | n/a | yes | n/a |
| Counts against 35 msg/s | yes | no | no | no | no | no |
| Value types | digital, analog, text, T5, RGBW, single channel, tunable white | doubles, text (colours as text) | digital, analog, text | parsed numbers | `<v>` in a URL | parsed numbers |
| Auth | ID filter (+ password, receive only) | user + token | user per request | none | token (webhook) | token in URL |
| On the wire | cleartext (encryption parked) | login encrypted, values cleartext; TLS Gen2 (verify) | cleartext (HTTPS Gen2, verify) | cleartext | cleartext (HTTPS verify) | cleartext |
| Latency | ~30 ms echo | push, unmeasured | per request | fire-and-forget | per change | polling cycle |
| Health | traffic and heartbeat | connection and keepalive | per request | none | none | none |
| Nexus work | done | new plugin | in option 1 | small plugin | none (docs) | small plugin |
| Verdict | keep, primary | **build** | via option 1 | skip | **document** | defer |

## What option 1 gives users

- **No wiring per value.** Every visualised state can be picked from a catalog grouped by room
  and category, the way the Home Assistant and Fronius plugins work today: room temperatures,
  meter totals, blind positions, presence, the active Lighting Controller mood, the Wallbox.
- **States ICI can't see** unless someone wires them: totals per day, week and month, target
  temperatures, override reasons, lock states.
- **Control without wiring.** Switch, dim, move blinds and change Lighting Controller moods from
  any wire, for example from a Home Assistant sensor, a calendar event or a script.
- **History and export of any control** through S1–S4. Selecting a state is enough; it causes no
  ICI load.
- **Bridging with Home Assistant both ways, signal by signal**: a Loxone state wired to an HA
  actuator, an HA sensor wired to a Loxone control. Nexus does not make Loxone controls appear as
  HA entities, which is a job for an HA integration.
  - **Loops.** `LoopGuard` catches loops within one trace. A loop that goes out through the
    Miniserver and comes back as a new event doesn't share a trace, so dedup, `Throttle` and forces
    remain the guards (roadmap top risk 4).
- **Less ICI load.** Read-only values can move from ICI to the WebSocket.

It does **not** replace ICI. Values that aren't visualised and typed Smart Actuator or T5 values
into function blocks stay on ICI.

## What option 1 makes possible later (not part of the first steps)

- **A Loxone section in the UI.** It would group plugin signals of this kind by room on the
  Miniserver's page, and link a plugin instance to the core Miniserver with the same host. This
  needs a design of its own.
- **Bulk add from the catalog** ("all states of this room"). This is a web UI feature that
  benefits every plugin.
- **Statistics backfill** into history or InfluxDB, as a feature of the plugin.
- **System messages and Miniserver status** (message center, `hasInternet`, operating mode) as
  sensors.
- **Moving it into `packages/loxone`.** If the plugin turns out to be part of the primary use case,
  it can move there; MIT code may flow into the GPL app. That would need a new ADR, its own tables,
  API and UI, which is why it isn't the starting point.

## Recommendation and order

1. **L1: read states (first milestone).** Details are below.
2. **Guide page "Miniserver → Nexus over HTTP"** with the webhook plugin. This is documentation
   only and can be done any time.
3. **L2: commands.**
   - The generic `Command` actuator, then `Switch`, `Pulse`, `Dimmer`, `BlindPosition`, `Mood` and
     `VirtualInput`, with catalog entries for the commands each control type supports.
   - Secured controls stay out.
   - A live test runs only on controls the owner names.
4. **L3: colours and moods.**
   - Colour picker states and commands mapped to `rgbw` and `tunableWhite`.
   - Mood lists in the catalog.
   - Units from `details.format`.
   - Optional `wss://` on Gen2 once the certificate question is answered.
5. **Deferred:** Virtual HTTP Input plugin, statistics backfill, room and category on imported ICI
   signals.
6. **Skipped:** Virtual UDP in and out, HTTP-per-value Virtual Inputs as a transport, Modbus TCP,
   log files.
7. **Not planned here:** encrypted ICI sending. It is the owner's open decision.

### First milestone: L1, "Loxone controls" plugin, read-only

Scope:
- `plugins/loxone-controls` with a manifest. Its config is `host`, `port` (default 80),
  `username` and a secret `password`.
- Connection:
  - Key exchange and token login; the token is kept in the plugin store and refreshed.
  - A refused password is never retried.
  - Reconnects with backoff, keepalive, and the out-of-service notice.
- Structure:
  - Downloaded, zod-validated subset, capped in size.
  - Cached by `lastModified`, re-resolved after every reconnect.
- Binary value and text events, decoded with checked lengths.
- `NumberState`, `SwitchState` and `TextState` sensors with `{ control, state }` params.
- The catalog: room ▸ category ▸ control ▸ states, with current values.
- The panel: connection, user, token validity, structure date, controls, events per second.
- A user guide page: dedicated user, rights, visualisation, what "missing control" means, login
  bans, reconnects after saves.

Left out of L1: commands, secured controls, colours, TLS, statistics, a Loxone UI section, any
link to the core Miniserver.

Verify:
- Fake Miniserver tests for every path listed under Testability. They run with `mock.timers`,
  and no sleeps beyond one real backoff.
- The catalog of a synthetic structure with every control type the owner's file contains renders
  in the catalog browser. With an equally large synthetic file (1,600 states), it stays as
  responsive as the Home Assistant catalog with 1,800 entries.
- **With the owner's OK:**
  - A read-only live run against the test Miniserver with a dedicated user.
  - The event rate of a fast value is compared with the same value over ICI (e.g. `rand`
    visualised as a virtual state).
  - Reconnect after a "save to Miniserver".
- No active handles remain after stop and start (the existing chaos check).

## To verify

Against the test Miniserver, only with the owner's OK and only read-only unless he says otherwise:

1. Is the structure file filtered by the logged-in user's rights?
2. How many concurrent WebSocket clients does a Gen2 (and a Gen1) accept?
3. Does the Miniserver coalesce fast state changes on the WebSocket, and what is the latency
   compared with ICI?
4. How does the Miniserver lock out an address after failed logins, and does that lock also block
   UDP (ICI)? (Find out from the documentation, not by trying.)
5. Lifetime of app tokens, how many tokens a user may hold, and how the Miniserver handles
   `refreshjwt` on firmware 17.2.
6. Local `wss://` on Gen2: which host name the certificate needs, and whether that works without
   internet access.
7. Do Virtual Output Commands support HTTP headers and `https://` addresses? Do Virtual HTTP
   Inputs support `https://`?
8. Does firmware 17.2 still accept Basic auth for `/dev/sps/io`? (Only relevant for documenting
   option 2.)
9. Do `HItcIn`/`HItcOut` in the project XML carry room and category references? (Can be checked
   offline in a project file.)
10. Which statistics format does firmware 17.2 use?

Locally, without the Miniserver:

11. Node 24 `crypto.publicEncrypt` with `RSA_PKCS1_PADDING`. The Marvin-attack restriction is on
    private-key decryption; confirm that public-key encryption still works.
