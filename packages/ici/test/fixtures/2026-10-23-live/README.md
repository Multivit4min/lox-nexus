# Live captures, 2026-10-23

Captured from the test Miniserver (10.10.10.205, own ID `server`) sending to remote systems
`claude` and `red` at the same host and port. Each line is `{ t: epoch ms, from, hex }` (received
datagrams), or a tx/rx record in the probe file.

| File | Contents |
|---|---|
| `data-packets.jsonl` | 150 consecutive 0x9E packets: `rand` (analog, about every 500 ms), `randmod` (digital), `outrgbw`, plus `red/*` packets that a receiver for `claude` must ignore |
| `status-0x8d.jsonl` | 0x8D status packets, which arrive as pairs about every 278 s |
| `lighting-moods.jsonl` | `moodin` sent over ICI (tx records) and the Lighting Controller outputs `lcout` (RGBW) and `moodout`. Run `moods1` steps through moods 0/50/51/99/98/69; `moods2` holds the animated mood 69 for 40 s. Shows flags `0x4000` on sequence steps |
| `lighting-moods-2026-10-24.jsonl` | Run `moods3`, a day later: `lcout` and `moodout` while `moodin` steps through 0/50/51/99/98/60/69/0 (tx records). Every mood matches its definition in the Loxone Config project, including the new mood 60 (`g2 b50`) |
| `encrypted-analog.jsonl` | 40 consecutive 0x9F packets from the encrypted remote system `encrypte` (same port): output `analog` mirrors `rand` every 500 ms. The password is not stored here; `IciCipher.live.test.ts` decrypts them when `ICI_FIXTURE_PASSWORD` is set and otherwise checks only the envelope |
| `rgbw-passthrough.jsonl` | RGBW payloads sent to input `inrgbw` (wired directly to output `outrgbw`) and the echoes, which are byte-identical, including out-of-range values |

Findings are documented in `../../../PROTOCOL.md`.
