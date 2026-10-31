# UniFi Network plugin

Connects a UniFi console (UniFi Network) to Nexus through Ubiquiti's official Network
Integration API. Presence of phones and computers, device and port states come into Nexus as
sensors. Device restarts, PoE power-cycles, guest access, Wi-Fi networks and hotspot vouchers go
the other way.

## What it does

- **Sensors:** per client: connected (presence), the access point or switch it is on, its IP
  address. Per device: online, state, firmware update available, CPU, memory, uptime and uplink
  rates. Per switch port: link, speed and PoE state. Whether a Wi-Fi network is on, and the code
  of the newest voucher.
- **Actuators:** restart a device, power-cycle a PoE port, authorize or unauthorize a guest,
  switch a Wi-Fi network on or off, create a voucher.
- **Catalog:** the connected clients (by MAC address and by name), the devices with their ports,
  the Wi-Fi networks and the vouchers, all ready to add.
- **Panel:** whether the console can be read, its Network version and site, the number of clients
  and devices online, a switch per Wi-Fi network, the devices with a Restart button, the switch
  ports with Power-cycle on PoE ports, and the connected clients. It refreshes after every poll.
- **Actions:** Create voucher (answers with the code and a QR code of it), List vouchers, Delete
  voucher.

## Before you start

- A UniFi console (a Cloud Gateway, a Dream Machine, or a server running UniFi Network) that
  Nexus can reach over HTTPS, and its IP address or host name.
- An API key: on the console open **Settings › Control Plane › Integrations** and create one.
  Treat it like a password.
- The console's certificate fingerprint (SHA-256). Consoles use a self-signed certificate, so
  pinning it is the safe way to connect. **Test connection** shows the fingerprint the console
  presents; see "Good to know".

## Configuration

| Field | | Description |
|---|---|---|
| **Console address** (`host`) | required | IP address or host name, e.g. `192.168.1.1`. The API is then reached under `/proxy/network/integration`. A URL with a path, e.g. `https://unifi.example:8443/integration`, uses that path instead. https only. |
| **API key** (`apiKey`) | required; secret | The key from Settings › Control Plane › Integrations. |
| **Site** (`site`) | optional; default empty | Name or id of the UniFi site. Empty: the console's first site, which is `Default` on most consoles. |
| **Poll every** (`pollInterval`) | optional; default `15` s | Time between two reads of clients, devices and Wi-Fi networks, `5` to `3600` seconds. |
| **Timeout** (`timeout`) | optional; default `10` s | Time a single request may take, `1` to `20` seconds. |
| **Certificate fingerprint (SHA-256)** (`fingerprint`) | optional, recommended | The console's certificate, as 64 hex digits (`AB:CD:…`, with or without colons). Only this certificate is accepted. |
| **Accept any certificate (insecure)** (`acceptAnyCertificate`) | optional; default off | Skips the certificate check, for this console only. A pinned fingerprint wins over it. |

## Sensors and actuators

| Kind | Name (id) | Value | What it is |
|---|---|---|---|
| sensor | Client connected (`client-connected`) | boolean | `true` while the client is connected (presence). |
| sensor | Client connected to (`client-uplink`) | text | The access point or switch the client is on, `VPN` for VPN clients, empty while away. |
| sensor | Client IP address (`client-ip`) | text | The client's IP address, empty while away. |
| sensor | Device online (`device-online`) | boolean | `true` while the device's state is `ONLINE`. |
| sensor | Device state (`device-state`) | text | `ONLINE`, `OFFLINE`, `UPDATING`, `GETTING_READY`, `ADOPTING`, … |
| sensor | Firmware update available (`device-update`) | boolean | `true` while the console offers a firmware update. |
| sensor | CPU load (`device-cpu`) | number, % | The device's CPU load. |
| sensor | Memory use (`device-memory`) | number, % | The device's memory use. |
| sensor | Uptime (`device-uptime`) | number, s | Seconds since the device started. |
| sensor | Uplink download (`device-uplink-rx`) | number, Mbit/s | What the device receives over its uplink. |
| sensor | Uplink upload (`device-uplink-tx`) | number, Mbit/s | What the device sends over its uplink. |
| sensor | Port link (`port-link`) | boolean | `true` while the port's link is up. |
| sensor | Port speed (`port-speed`) | number, Mbit/s | The link speed, `0` while nothing is connected. |
| sensor | Port PoE state (`port-poe`) | text | `UP`, `DOWN`, `LIMITED`, `UNKNOWN`, or `OFF` when PoE is switched off. |
| sensor | Wi-Fi network on (`wifi-enabled`) | boolean | `true` while the Wi-Fi network is switched on. |
| sensor | Newest voucher code (`voucher-code`) | text | The code of the newest voucher this instance created, e.g. for a display. |
| actuator | Restart device (`device-restart`) | boolean | Restarts the device on a pulse (a rising `true`). |
| actuator | Power-cycle PoE port (`port-power-cycle`) | boolean | Cuts the port's PoE power briefly on a pulse, restarting what it powers. |
| actuator | Guest access (`guest-access`) | boolean | `true` authorizes a connected guest client, `false` unauthorizes it. |
| actuator | Wi-Fi network on/off (`wifi-enabled`) | boolean | Switches the Wi-Fi network (e.g. the guest network) on or off. |
| actuator | Create voucher (`create-voucher`) | boolean | Creates a hotspot voucher on a pulse; its code goes to the code sensor. |

## Good to know

- **Presence flickers:** phones leave Wi-Fi while they sleep. A `debounce` step of e.g. 10 minutes
  on the wire hides such short absences; it delays arrivals by as much, so for an instant "home"
  use Loxone's own off-delay on the raw value instead. The plugin doesn't smooth anything itself.
- **iPhones and rotating addresses:** with "Private Wi-Fi Address" set to rotating, a phone's MAC
  address changes. Add its sensors by name (the catalog's "(by name)" entries) instead.
- **The fingerprint:** with the field empty, **Test connection** fails and names the fingerprint
  the console presented. Compare it with the console's own certificate (your browser shows it
  when you open the console directly), then paste it. After a new certificate on the console,
  update it here.
- **Restart and power-cycle act on a new pulse only:** a repeated `true` does nothing, and so does
  the value Nexus delivers again after a start, so restarting Nexus doesn't repeat a restart. Use
  short pulses: a `true` still held when Nexus starts may count as new.
- **What the API doesn't offer:** no events (the plugin polls), no WAN up or down state, no
  per-client signal strength or traffic, no blocking of clients, no alarms or history.

## More

The full reference (params of every sensor and actuator, the endpoints the plugin uses, polling
and backoff, the catalog and panel, actions, security notes, limits and development notes) is in
`REFERENCE.md` next to this file, and on the plugin's page in the Nexus documentation.
