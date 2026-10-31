## The API it uses

Only Ubiquiti's official, documented **UniFi Network Integration API** (`/v1`, the
`X-API-Key` header), as described by its OpenAPI spec for UniFi Network 10.3.58. No classic
endpoints (`/api/s/…`), no websockets, nothing reverse-engineered. UniFi Protect and Access are
not covered; they would be separate plugins.

| Endpoint | Used for |
|---|---|
| `GET /v1/info` | the Network version; the start and Test connection check the key with it |
| `GET /v1/sites` | finding the site's id |
| `GET /v1/sites/{siteId}/clients` | presence and the clients table, every poll |
| `POST /v1/sites/{siteId}/clients/{clientId}/actions` | `AUTHORIZE_GUEST_ACCESS` (with `timeLimitMinutes`), `UNAUTHORIZE_GUEST_ACCESS` |
| `GET /v1/sites/{siteId}/devices` | device state and firmware, every poll |
| `GET /v1/sites/{siteId}/devices/{deviceId}` | ports: of switching devices every poll, of others while a port signal needs them, and for the catalog |
| `GET /v1/sites/{siteId}/devices/{deviceId}/statistics/latest` | CPU, memory, uptime, uplink rates, only of online devices with such a signal |
| `POST /v1/sites/{siteId}/devices/{deviceId}/actions` | `RESTART` |
| `POST /v1/sites/{siteId}/devices/{deviceId}/interfaces/ports/{portIdx}/actions` | `POWER_CYCLE` |
| `GET /v1/sites/{siteId}/wifi/broadcasts` | Wi-Fi networks, every poll |
| `GET` and `PUT /v1/sites/{siteId}/wifi/broadcasts/{id}` | switching a Wi-Fi network on or off |
| `GET`, `POST` and `DELETE /v1/sites/{siteId}/hotspot/vouchers` | listing, creating and deleting vouchers |

Lists are read page by page (`offset`, `limit=200`) until `totalCount`, at most 50 pages.
Every request has the configured timeout and uses its own connection, closed after the answer.
Errors show the API's `message` (from its "Error Message" body) and the HTTP status.

**Minimum version.** The plugin is built and tested against the API description of UniFi Network
10.3.58; no real console was available to test against. Older Network versions with the
Integration API may lack endpoints or fields. A missing Wi-Fi endpoint doesn't stop the rest: the
panel then says it can't list the Wi-Fi networks.

### What the API can't do

These are not in the official API, so the plugin doesn't offer them (and doesn't fake them):
events or push updates (it polls), the WAN's up or down state (the WAN list has only ids and
names), signal strength or traffic per client, blocking clients, alarms and history. Clients that
aren't connected aren't listed at all.

## Connection and certificate

The console's certificate is checked in one of three ways, for this plugin's connections only
(nothing changes for the rest of Nexus):

| Setting | Check |
|---|---|
| fingerprint set | only a certificate with this SHA-256 fingerprint is accepted (pinning; recommended) |
| neither | the usual check against trusted authorities and the host name; a self-signed console fails it |
| **Accept any certificate** on, no fingerprint | none; anyone in the network path could read the API key |

The decision is made after the TLS handshake and **before** the request is written, so the API key
never reaches a server whose certificate was refused. A refusal names the fingerprint the server
presented.

To read the fingerprint: save the settings with the fingerprint empty and press **Test
connection**; the message names it. Or ask the console yourself:

```
openssl s_client -connect 192.168.1.1:443 </dev/null 2>/dev/null | openssl x509 -noout -fingerprint -sha256
```

Compare it with what your browser shows for the console's certificate before you trust it. Any
spelling works: colons, spaces, dashes or none, upper or lower case.

**Start and errors.** At the start the plugin reads `/v1/info` once. A refused key (HTTP 401 or 403)
fails the start, since a restart can't fix it. A console that doesn't answer doesn't: the instance
starts **degraded** and keeps trying.

## Polling

One loop reads clients, devices and Wi-Fi networks every **Poll every** seconds, plus ports and
statistics as described above. A poll asked for while one runs joins it. After a failed poll the
next attempt waits longer each time: one interval, then two, four, up to 5 minutes; the first
good poll goes back to the normal pace. While polls fail the instance is **degraded** with the
reason, and every sensor fed by the poll fails with "can't read the UniFi console: …", keeping
its last value; the next good poll sends values again and ends the failure. A changing failure is
logged once, not once per poll.

## Sensors

All poll-fed sensors emit after every poll (the bus drops repeats) and right away when added to a
running instance.

### Client sensors

`client-connected` (boolean), `client-uplink` (text) and `client-ip` (text).

| Param | Form title | | Description |
|---|---|---|---|
| `client` | Client | required | A MAC address (`02:00:00:00:10:01`, also with dashes or without separators), or with `matchBy` `name` the client's name as UniFi shows it. Groups the signals in lists. |
| `matchBy` | Match by | default `mac` | `mac` or `name`. By name ignores case and outer spaces; if several connected clients have the name, the one connected last counts. |

A client that isn't in the list of connected clients is away: `false`, and empty text.
`client-uplink` names the uplink device (`uplinkDeviceId`), `VPN` or `Teleport` for those
clients, and is empty for a client without one.

### Device sensors

`device-online`, `device-state`, `device-update`, `device-cpu`, `device-memory`, `device-uptime`,
`device-uplink-rx`, `device-uplink-tx`.

| Param | Form title | | Description |
|---|---|---|---|
| `device` | Device | required | The device's MAC address. Stable across renames; groups the signals in lists. |

- A MAC the console doesn't list fails the signal ("no device … on the console").
- The statistics sensors ask the console for that device's `statistics/latest` only while they
  exist. A device that isn't `ONLINE` has no statistics: the signal fails with its state until it
  is back.
- `device-uplink-rx` and `-tx` read `uplink.rxRateBps` and `txRateBps`. The spec doesn't describe
  their unit; the plugin reads them as bits per second, like the API's documented `Kbps` fields
  (kilobits per second), and divides by 1 000 000 for Mbit/s.
- `device-cpu` and `device-memory` are `cpuUtilizationPct` and `memoryUtilizationPct`;
  `device-uptime` is `uptimeSec`.

### Port sensors

`port-link`, `port-speed` (Mbit/s) and `port-poe` (text).

| Param | Form title | | Description |
|---|---|---|---|
| `device` | Device | required | The switch's MAC address. |
| `port` | Port | required | The port's number (`idx`), from 1. |

Signal lists group them as "device ▸ port". A port the device doesn't have, or `port-poe` on a
port without PoE, fails the signal. `port-poe` is the API's PoE state (`UP` supplies power,
`DOWN`, `LIMITED`, `UNKNOWN`), or `OFF` while PoE is switched off on the port.

### `wifi-enabled` and `voucher-code`

`wifi-enabled` takes `network`, the Wi-Fi network's name (SSID), ignoring case; a name that
matches none or several networks fails the signal. Renaming the network in UniFi breaks the signal.

`voucher-code` has no params. It shows the newest voucher created by this instance (the action or
the actuator), also after a restart, as the code is kept in the instance's store.

## Actuators

All accept a boolean.

| Actuator | Params | On |
|---|---|---|
| `device-restart` | `device` | a new rising `true` |
| `port-power-cycle` | `device`, `port` | a new rising `true` |
| `guest-access` | `client`, `matchBy`, `minutes` (optional, 1 to 1 000 000; empty: the site's default) | `true` authorizes, `false` unauthorizes |
| `wifi-enabled` | `network` | `true` on, `false` off |
| `create-voucher` | `minutes` (default `1440`), `guests` (optional), `note` (default `Loxone`) | a new rising `true` |

- **Pulses.** `device-restart`, `port-power-cycle` and `create-voucher` act on `true` after `false`
  only (the start counts as `false`), so a Loxone pulse acts once and a repeated `true` does
  nothing. A value Nexus replays after a start (a forced value) is ignored by these and by
  `guest-access`, so restarting Nexus doesn't repeat a restart or a voucher. That relies on Nexus
  flagging what it delivers again: a `true` the Miniserver still holds when Nexus starts, sent
  after Nexus last kept its values (every few seconds), counts as new, so use short pulses. Restart and
  power-cycle log who asked (the signal's name) at info level.
- **Guest access** looks the client up in a fresh list of connected clients. It refuses clients
  that aren't connected (UniFi can't authorize them) or aren't guests. Authorizing again starts a
  new authorization with fresh counters.
- **Wi-Fi.** The API has no partial update: the plugin reads the network's full object, changes
  `enabled` and sends everything back with `PUT` (without the read-only `id` and `metadata`).
  Nothing is sent when the network already is in that state, so a replay just confirms it. The
  object contains the passphrase: it is never logged, shown or returned.

## Catalog

| Node | Entries |
|---|---|
| Clients (connected now) ▸ client | connected, connected to, IP address, by MAC; the same by name; guest access for guests |
| Devices ▸ device | online, state, firmware update, CPU, memory, uptime, uplink rates, restart |
| Devices ▸ device ▸ Port n | link, speed; PoE state and power-cycle on PoE ports |
| Wi-Fi networks ▸ network | on (sensor), on/off (actuator) |
| Vouchers | newest voucher code, create voucher (1 day) |

Only connected clients appear: connect a device once to add it. The catalog reads the ports of
devices the poll doesn't read anyway, once per browse.

## Panel

Pushed after every poll and after actions (`panelUpdates: "push"`).

- **Console:** a notice while the console can't be read; tiles with clients connected, devices
  online (with a bar) and guests; reading state, Network version, address, certificate check,
  site, last successful poll, last error (greyed once recovered), newest voucher.
- **Wi-Fi networks:** each with on or off and a switch (the `set-wifi` action, after a confirm).
- **Devices:** name, model, state (green online; red offline, connection interrupted, isolated,
  incorrect topology; yellow updating, getting ready, adopting, pending adoption; grey deleting), IP and MAC address, firmware (yellow with an update),
  and an instant **Restart** button with a confirm.
- **Ports:** ports of switching devices (and of devices with a port signal): link, speed, PoE, and
  an instant **Power-cycle** button with a confirm where PoE is on.
- **Connected clients:** name, IP and MAC address, where it is connected, type, access (guests
  with Authorize or Unauthorize, which opens the dialog for the minutes), connected since.

No secrets: neither the API key nor a Wi-Fi passphrase.

## Actions

| Action | Where | Input | Answer |
|---|---|---|---|
| Create voucher (`create-voucher`) | top | `minutes` (default 1440), `guests`, `note` (default `Nexus`), `dataLimitMB`, `downloadKbps`, `uploadKbps` | the code and a QR code of it |
| List vouchers (`list-vouchers`) | top | none | a table of the vouchers that haven't expired |
| Delete voucher (`delete-voucher`) | top | `code` (letters, digits, dashes) | how many were deleted; asks first |
| Switch Wi-Fi network (`set-wifi`) | panel | `network` (id), `enabled` | the new state; asks first |
| Restart (`restart-device`) | panel | `device` (MAC) | asks first |
| Power-cycle (`power-cycle-port`) | panel | `device`, `port` | asks first |
| Guest access (`guest-access`) | panel | `client`, `matchBy`, `authorize`, `minutes` | what happened |

Voucher limits follow the API: minutes 1 to 1 000 000, data 1 to 1 048 576 MB, rates 2 to
100 000 kbit/s. The QR code holds the code itself (the API names no portal address to encode).
Delete voucher uses the API's filter `code.eq('…')`.

## Security notes

- The API key is a secret field: never shown again, never logged, sent only to the console over
  TLS after the certificate check.
- Voucher codes are guest credentials. They appear in the action's answer, the panel and on the
  `voucher-code` sensor (and so on the bus and in history, if recorded), never in the log.
- The Wi-Fi switch reads and writes the network's full settings including its passphrase, which
  stays inside the plugin.

## Development

- Tests run against a fake console in the test process: HTTPS on 127.0.0.1 (port 0) with a
  self-signed certificate generated at test time (no key in the repository), synthetic fixtures
  in `test/fixtures/` shaped after the spec's schemas, and a `TestClock` for polls, backoff and
  timeouts. They never contact a real address.
- Build: `npm run build` in `plugins/unifi` writes `dist/plugin.js`.
