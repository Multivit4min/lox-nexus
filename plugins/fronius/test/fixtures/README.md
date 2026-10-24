# Fronius Solar API fixtures

The `live-gen24-*` files were **recorded** from a real Fronius GEN24 on 2026-10-24 (API version 1,
compatibility range 1.7-10, power flow version 12). Serial numbers are replaced. The installation
has a Smart Meter TS 65A-3 at the grid (meter 2), a secondary meter labelled "Solax" for a second
PV inverter (meter 3) and no battery.

| File | Endpoint |
|---|---|
| `live-gen24-powerflow.json` | GetPowerFlowRealtimeData |
| `live-gen24-meter-system.json` | GetMeterRealtimeData, Scope=System |
| `live-gen24-storage-system.json` | GetStorageRealtimeData, Scope=System (empty: no battery) |

The others are **synthesized** from the Fronius Solar API v1 documentation (field names, nesting
and the `Head`/`Body` envelope), with plausible values, to cover what the real installation
doesn't have (a battery, a missing meter, errors). The recording confirmed their field names
(`E_Day`, `E_Total`, `P_Grid`, …); it differs from the documentation only in `SecondaryMeters`,
whose location field is `MLoc`, not `Mloc`.

| File | Endpoint | Installation |
|---|---|---|
| `powerflow-gen24.json` | GetPowerFlowRealtimeData | GEN24 Plus, smart meter at the grid, BYD battery charging |
| `meter-system.json` | GetMeterRealtimeData, Scope=System | one Smart Meter TS 65A-3 (device 0) |
| `meter-device-0.json` | GetMeterRealtimeData, Scope=Device, DeviceId=0 | the same meter, abbreviated |
| `storage-system.json` | GetStorageRealtimeData, Scope=System | one battery (device 0) |
| `powerflow-produce-only.json` | GetPowerFlowRealtimeData | Symo without meter or battery |
| `empty-system.json` | meter or storage, Scope=System | no such device |
| `status-error.json` | any | the device refuses (Head.Status.Code 255) |
