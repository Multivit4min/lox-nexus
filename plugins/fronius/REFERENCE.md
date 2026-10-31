## How polling works

Every poll reads three Solar API v1 endpoints in parallel (below `solar_api/v1/` of the configured
address):

| Endpoint | Snapshot key | Required |
|---|---|---|
| `GetPowerFlowRealtimeData.fcgi` | `powerflow` | yes: if it fails, the poll fails |
| `GetMeterRealtimeData.cgi?Scope=System` | `meter` | no: absent without a smart meter |
| `GetStorageRealtimeData.cgi?Scope=System` | `storage` | no: absent without a battery |

The first poll runs right after the start without holding it up; after that the plugin polls
every `pollInterval` seconds. A poll that is due while one is still running joins it instead of
starting a second one. A successful poll keeps the result as the latest snapshot, which the
sensors, the catalog and the panel read. When the power flow can't be read, the previous snapshot
stays and the meter and storage results of that poll are ignored.

**Test connection** in the settings form reads the power flow once and says how many inverters answered and the PV power.

## Sensor `value`

One value of the poll data, value type `any`.

| Param | Form title | | Description |
|---|---|---|---|
| `path` | Data path | required | A dot path into the snapshot, starting with `powerflow`, `meter` or `storage`, e.g. `powerflow.Site.P_PV`. No spaces. |

Most users never type the path: adding a value from the catalog fills it in.

- Numbers, strings, booleans and `null` pass through as the matching value. `null` means the
  component is inactive, e.g. PV power at night.
- The sensor emits after every successful poll (the bus drops repeats), and once when it is added
  if data is already there.
- A new value warns that it is stale after 5 minutes without a successful poll (**Warn when no
  value for** in the signal's form); with a long poll interval, raise it to a few intervals.
- A path that doesn't resolve, or that points to an object or a list, emits nothing. The device
  behind it may be missing, or its endpoint failed this time; the sensor keeps its last value.
- Device ids are the keys the inverter uses, written as plain path segments (`meter.0.…`). Inverters
  usually start at `1`. Meters and batteries often start at `0`, but not always: one GEN24 reports
  its grid meter as `2` and a secondary meter as `3`. The catalog shows the ids your installation
  uses.

### Common paths

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
| `powerflow.Site.Mode` | text | e.g. `meter`, `bidirectional` |
| `powerflow.Inverters.1.P` | W | AC output of inverter 1 |
| `powerflow.Inverters.1.SOC` | % | battery state of charge as the hybrid inverter reports it |
| `powerflow.Inverters.1.Battery_Mode` | text | e.g. `normal`, `battery full`, `suspended`, `nearly depleted` |
| `meter.0.PowerReal_P_Sum` | W | smart meter 0 power (also `_Phase_1` … `_3`) |
| `meter.0.Voltage_AC_Phase_1` | V | also `_2`, `_3` and `Voltage_AC_PhaseToPhase_12/23/31` |
| `meter.0.Current_AC_Phase_1` | A | also `_2`, `_3`, `Current_AC_Sum` |
| `meter.0.Frequency_Phase_Average` | Hz | |
| `meter.0.EnergyReal_WAC_Plus_Absolute` | Wh | imported (`Minus` exported) |
| `storage.0.Controller.StateOfCharge_Relative` | % | battery 0 |
| `storage.0.Controller.Temperature_Cell` | °C | |
| `storage.0.Controller.Voltage_DC` / `.Current_DC` | V / A | |
| `powerflow.Smartloads.Ohmpilots.0.Temperature` | °C | Ohm Pilot tank temperature |

## Catalog

The catalog is built from the latest successful poll and lists only what this installation
reports. Before the first successful poll it is empty.

| Node | Children | Fields offered |
|---|---|---|
| **Site** | none | PV, grid, load and battery power, autonomy, self-consumption, energy today, this year and in total, system mode, backup mode, battery standby |
| **Inverters** | one per inverter, `Inverter <id>` | AC power, battery state of charge, battery mode, energy today, this year and in total |
| **Meters** | one per meter, `Meter <id> (<model>)` | power (total and L1 to L3), apparent and reactive power, power factor, voltage L1 to L3 and between phases, current (total and L1 to L3), frequency, energy consumed, produced, imported and exported |
| **Batteries** | one per battery (the Solar API's `storage`), `Battery <id> (<model>)` | state of charge, cell temperature, DC voltage and current, maximum and designed capacity |
| **Ohm Pilots** | one per Ohm Pilot, `Ohm Pilot <id>` | heating power, state, water temperature |

- Each entry is a ready-to-add `value` sensor with a readable suggested name (`P_PV` is
  *PV power*, meter phases are *L1* to *L3*), its current value and, where the field has one, its
  unit (W, Wh, VA, var, V, A, Hz, %, °C).
- A secondary meter (e.g. one for a second PV inverter) is named after the label the installer
  gave it, e.g. `Meter 3 (Solax)` with entries such as *Solax power*, instead of after its model.
- Fields that are `null` are left out, because they mean the component is missing (no meter, no
  battery). The exceptions are PV power and inverter AC power, which are only `null` while the
  inverter sleeps.
- Nodes without any usable field are left out.

## Panel

Two sections. The page refreshes after every poll (and when reading starts or stops failing)
instead of asking every few seconds.

**Power flow**, as tiles:

| Tile | Shown |
|---|---|
| Photovoltaics, Grid, Load | always; power in W with Fronius's signs (grid + from the grid, load negative), a dash while there is no reading |
| Battery | when the inverter reports battery power (W, + discharging, − charging) |
| Battery charge | when there is a battery: the battery's own state of charge, otherwise the one the hybrid inverter reports (%, with a bar) |
| Autonomy | when the inverter reports it (%, with a bar) |

**Inverter**:

| Row | Shown |
|---|---|
| Reading | `ok` (green), `can't read the inverter: …` with the reason (red), or `waiting for the first poll` (grey) |
| Last successful poll | time, or `never` |
| Last error | the last reason the power flow couldn't be read, with its time; red while it lasts, grey once it recovered |

Meter and battery endpoint failures don't appear in the panel; they are in the log.

### Debug log

With **Debug for 15 min** on the instance's log card, the log also gets a line per poll: how long it took
and the outcome of the power flow, meter and storage endpoints.

## Status and errors

- The instance is **degraded** with the reason while the power flow can't be read, and goes back to
  **running** with the next successful poll. Reasons name the endpoint and what went wrong, e.g.
  `GetPowerFlowRealtimeData: HTTP 503`, `… no answer within 5 s`,
  `… unreachable (connect ECONNREFUSED …)`, `… device answered with status 255 (…)`,
  `… expected JSON, got text/html: "…"` or `… unexpected response: …`.
- Only changes are reported, so a night-long outage is one status change and one log line.
- An unreachable inverter never fails the start. The instance starts and stays degraded until the
  inverter answers.
- A failing meter or storage endpoint only writes a log line (once, and again on recovery). The
  values of that part stay unchanged until it answers again. While the power flow fails too, meter
  and storage failures aren't reported, since they say nothing about those devices.

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
- No per-device scope for polling: the plugin always reads the whole system (`Scope=System`). The
  client supports `Scope=Device` (`SolarApi.meter(id)`, `SolarApi.storage(id)`).
- `GetInverterRealtimeData` (DC voltages and currents per string) and the archive endpoints aren't
  polled.
- Each request opens a new connection (`Connection: close`), so nothing outlives a stop. At poll
  intervals of seconds this costs nothing worth keeping a socket for.

## Development

```
npm test                                      # from the repo root; tests live next to the code in src/
npm run build -w @lox-nexus/plugin-fronius    # dist/plugin.js, one ESM bundle (esbuild)
```

Tests run against a local fixture server. The fixtures in `test/fixtures/` are partly recorded from
two real GEN24 inverters (one with a grid meter and a secondary meter labelled "Solax", one with a
BYD battery and an Ohm Pilot; serial numbers replaced) and partly synthesized from the Solar API v1
documentation to cover what those installations don't have (a missing meter, device errors). The
fixtures' own README lists every file.
