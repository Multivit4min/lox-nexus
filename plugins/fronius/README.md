# Fronius plugin

Reads a Fronius inverter (GEN24, Tauro, Verto, Symo, Primo) or Datamanager over its local Solar
API v1 and brings its values into Nexus as sensors. Values flow one way only, from the inverter to
Nexus: the plugin is read-only.

## What it does

- **Sensors:** PV, grid, load and battery power, autonomy and self-consumption, energy counters,
  smart meter readings (power, voltage, current, frequency, energy), battery charge and
  temperature, and Ohm Pilot values, polled every few seconds.
- **Catalog:** the site, each inverter, meter, battery and Ohm Pilot the installation reports,
  with every value ready to add.
- **Panel:** current PV, grid, load and battery power, battery charge, autonomy, the time of the
  last successful poll and the last error.

## Before you start

- A Fronius inverter or Datamanager that Nexus can reach over HTTP on your network, and its
  address (IP or host name).
- The Solar API switched on. On GEN24, Tauro and Verto it is in the inverter's web interface under
  Communication, Solar API ("Activate communication via Solar API"); it is off by default there.
- No account or password: the Solar API has no login.

## Configuration

| Field | | Description |
|---|---|---|
| **Address** (`host`) | required | `http://` or `https://` URL of the inverter or Datamanager, e.g. `http://192.168.1.50`. A path is kept, so a reverse proxy prefix such as `https://proxy.lan/fronius` works. |
| **Poll every (seconds)** (`pollInterval`) | optional; default `5` | Seconds between two polls, `1` to `86400`. Raise it (e.g. `30`) if you don't need second-by-second power values. |
| **Timeout (seconds)** (`timeout`) | optional; default `5` | Seconds a single request may take, `1` to `60`. Raise it (e.g. `10`) for a slow Datamanager or a link over VPN. |

Nothing is secret: the Solar API has no authentication.

## Sensors and actuators

| Kind | Name (id) | Value | What it is |
|---|---|---|---|
| sensor | Value (`value`) | any | One value the inverter reports, picked by a data path such as `powerflow.Site.P_PV` (PV power in W). |

The plugin has no actuators: the Solar API v1 can't write anything.

## Good to know

- Add values from the catalog instead of typing a data path. The catalog fills in the path, a
  readable name and the unit.
- The catalog is empty until the first successful poll, and lists only what this installation
  reports: no meter or battery, no meter or battery entries.
- PV power is `null` while the inverter sleeps at night. Many inverters stop answering then
  altogether: the instance shows **degraded** with the reason and goes back to **running** with
  the next successful poll. Sensors keep their last value in between.
- An unreachable inverter never fails the start, and a night-long outage is one status change and
  one log line, not one per poll.
- On GEN24, Tauro and Verto the daily and yearly energy counters (`E_Day`, `E_Year`) are always
  `null`; `E_Total` is updated only every 5 minutes.

## More

The full reference (the `value` sensor's params, common data paths with units, the catalog tree,
panel fields, status and error messages, limits, what was fixed compared to the old integration,
and development notes) is in `REFERENCE.md` next to this file, and on the plugin's page in the
Nexus documentation.
