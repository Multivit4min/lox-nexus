# Fronius Solar API fixtures

These responses are **synthesized** from the Fronius Solar API v1 documentation (field names,
nesting and the `Head`/`Body` envelope), with plausible values; they were not captured from a
device. Replace them with real captures when one is available.

| File | Endpoint | Installation |
|---|---|---|
| `powerflow-gen24.json` | GetPowerFlowRealtimeData | GEN24 Plus, smart meter at the grid, BYD battery charging |
| `meter-system.json` | GetMeterRealtimeData, Scope=System | one Smart Meter TS 65A-3 (device 0) |
| `meter-device-0.json` | GetMeterRealtimeData, Scope=Device, DeviceId=0 | the same meter, abbreviated |
| `storage-system.json` | GetStorageRealtimeData, Scope=System | one battery (device 0) |
| `powerflow-produce-only.json` | GetPowerFlowRealtimeData | Symo without meter or battery |
| `empty-system.json` | meter or storage, Scope=System | no such device |
| `status-error.json` | any | the device refuses (Head.Status.Code 255) |
