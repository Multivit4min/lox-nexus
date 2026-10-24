# Fronius plugin

Reads a Fronius inverter (GEN24, Tauro, Verto, Symo, Primo) or Datamanager over its local **Solar
API v1** (plain HTTP, no login) and makes its values available as sensors: PV, grid, load and
battery power, autonomy, smart-meter readings and battery state. It is read-only, so it has no
actuators.

Every poll reads three endpoints in parallel:

| Endpoint | Snapshot key | Required |
|---|---|---|
| `GetPowerFlowRealtimeData.fcgi` | `powerflow` | yes: if it fails, the poll fails |
| `GetMeterRealtimeData.cgi?Scope=System` | `meter` | no: absent without a smart meter |
| `GetStorageRealtimeData.cgi?Scope=System` | `storage` | no: absent without a battery |

## Config

| Field | Default | |
|---|---|---|
| `host` | (required) | `http://` or `https://` URL of the inverter, e.g. `http://192.168.1.50`. A path is kept, so a reverse proxy prefix works. |
| `pollInterval` | `5` | seconds between polls (1 to 86400) |
| `timeout` | `5` | seconds a single request may take (1 to 60) |

Nothing is secret: the Solar API has no authentication.

## Sensors

### `value`: one value of the poll data (value type `any`)

Params: `{ path }`, a dot path into the snapshot. Numbers, strings, booleans and `null` pass through
as the matching value. `null` means the component is inactive, e.g. PV power at night. The sensor
emits after every successful poll (the bus drops repeats) and once when it is added if data is
already there. A path that doesn't resolve, or that points to an object, emits nothing. The device
behind it may be missing, or its endpoint failed this time.

Common paths:

| Path | Unit | |
|---|---|---|
| `powerflow.Site.P_PV` | W | PV production (DC side on GEN24 and Symo Hybrid); `null` while the inverter sleeps |
| `powerflow.Site.P_Grid` | W | + import from grid, - export |
| `powerflow.Site.P_Load` | W | house consumption, negative |
| `powerflow.Site.P_Akku` | W | + battery discharge, - charge; `null` without a battery |
| `powerflow.Site.rel_Autonomy` | % | |
| `powerflow.Site.rel_SelfConsumption` | % | |
| `powerflow.Site.E_Total` | Wh | updated only every 5 minutes on GEN24 |
| `powerflow.Site.E_Day`, `.E_Year` | Wh | always `null` on GEN24, Tauro and Verto |
| `powerflow.Inverters.1.P` | W | AC output of inverter 1 |
| `powerflow.Inverters.1.SOC` | % | battery state of charge as the hybrid inverter reports it |
| `powerflow.Inverters.1.Battery_Mode` | text | e.g. `normal`, `battery full`, `suspended` |
| `meter.0.PowerReal_P_Sum` | W | smart meter 0 power (also `_Phase_1` … `_3`) |
| `meter.0.Voltage_AC_Phase_1` | V | also `_2`, `_3` and `Voltage_AC_PhaseToPhase_12/23/31` |
| `meter.0.Current_AC_Phase_1` | A | also `_2`, `_3`, `Current_AC_Sum` |
| `meter.0.Frequency_Phase_Average` | Hz | |
| `meter.0.EnergyReal_WAC_Plus_Absolute` | Wh | imported (`Minus` exported) |
| `storage.0.Controller.StateOfCharge_Relative` | % | battery 0 |
| `storage.0.Controller.Temperature_Cell` | °C | |
| `storage.0.Controller.Voltage_DC` / `.Current_DC` | V / A | |
| `powerflow.Smartloads.Ohmpilots.0.Temperature` | °C | Ohm Pilot tank temperature |

Device ids are the keys the inverter uses. Inverters usually start at `1`, meters and storages at
`0`.

## Catalog

The catalog is built from the latest successful poll and lists only what this installation
reports:
- **Site**
- **Inverters**: one node per inverter
- **Meters**: one per meter, with its model
- **Storages**: one per battery, with its model
- **Ohm Pilots**

Each entry is a ready-to-add `value` sensor with a suggested name. Fields that are `null` are left
out, because they mean the component is missing (no meter, no battery). The exceptions are PV and
inverter power, which are only `null` while the inverter sleeps. Before the first successful poll
the catalog is empty.

## Panel

A key-value view with PV, grid and load power, battery power and charge (when there is a battery),
autonomy (when there is a meter), the time of the last successful poll, and the last error with its
time.

## Status

- The instance is **degraded** with the reason (e.g. `GetPowerFlowRealtimeData: HTTP 503`,
  `… no answer within 5 s`, `… unreachable (connect ECONNREFUSED …)`) while the power flow can't be
  read. It goes back to **running** with the next successful poll.
- Only changes are reported, so a night-long outage is one status change and one log line.
- An unreachable inverter never fails the start. The instance starts and stays degraded until the
  inverter answers.
- A failing meter or storage endpoint only writes a log line (once, and again on recovery). The
  values of that part stay unchanged until it answers again.

## Fixed compared to the old integration

- Polls no longer overlap: a poll that is due while one is still running joins it.
- Every request has a timeout.
- Responses are parsed as JSON whatever their content type says (older Datamanager devices send
  `text/javascript`); a body that isn't JSON is reported with its content type.
- Device id 0 is a device.
- Failures show up as the instance status.
- A missing meter or battery no longer fails the whole poll.

## Known limitations

- Read-only: the Solar API v1 has no write access. Battery or export control (Modbus) is not
  supported.
- No per-device scope for polling: the plugin always reads the whole system (Scope=System). The
  client supports `Scope=Device` (`SolarApi.meter(id)`, `SolarApi.storage(id)`).
- `GetInverterRealtimeData` (DC voltages and currents per string) and the archive endpoints aren't
  polled.
- Each request opens a new connection (`Connection: close`), so nothing outlives a stop. At poll
  intervals of seconds this costs nothing worth keeping a socket for.
- The test fixtures are synthesized from the Solar API documentation, not captured from a device
  (see `test/fixtures/README.md`).

## Development

```
npm test                                      # from the repo root; tests live next to the code in src/
npm run build -w @lox-nexus/plugin-fronius    # dist/plugin.js, one ESM bundle (esbuild)
```
