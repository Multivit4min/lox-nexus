# Fixtures

Synthetic answers of the UniFi Network Integration API, shaped after the schemas of its OpenAPI
spec (UniFi Network API 10.3.58): no real console was recorded. MAC addresses are locally
administered (`02:…`), IP addresses are from the documentation ranges (192.0.2.0/24, 198.51.100.0/24),
names and ids are made up. The fake console in `src/test-support/FakeConsole.ts` wraps lists in
the spec's page envelope (`offset`, `limit`, `count`, `totalCount`, `data`).

| File | Schema |
|---|---|
| `sites.json` | list of "Site overview" |
| `clients.json` | list of "Client overview" (WIRELESS, WIRED, VPN; DEFAULT and GUEST access) |
| `devices.json` | list of "Adopted device overview" |
| `device-details.json` | "Adopted device details" by device id |
| `statistics.json` | "Latest statistics for a device" by device id |
| `wifi-broadcasts.json` | list of "Wifi broadcast details" (the overview is derived from them) |
| `voucher.json` | one "Hotspot voucher details" |
