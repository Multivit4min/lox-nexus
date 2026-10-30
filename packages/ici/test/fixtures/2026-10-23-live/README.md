# Live captures, 2026-10-23

Captured from the test Miniserver (its LAN address replaced with 192.0.2.205, a documentation
address; own ID `server`) sending to remote systems `claude` and `red` at the same host and port.
Each line is `{ t: epoch ms, from, hex }` (received datagrams), or a tx/rx record in the probe
file.

| File | Contents |
|---|---|
| `data-packets.jsonl` | 150 consecutive 0x9E packets: `rand` (analog, about every 500 ms), `randmod` (digital), `outrgbw`, plus `red/*` packets that a receiver for `claude` must ignore |
| `status-0x8d.jsonl` | 0x8D status packets, which arrive as pairs about every 278 s |
| `lighting-moods.jsonl` | `moodin` sent over ICI (tx records) and the Lighting Controller outputs `lcout` (RGBW) and `moodout`. Run `moods1` steps through moods 0/50/51/99/98/69; `moods2` holds the animated mood 69 for 40 s. Shows flags `0x4000` on sequence steps |
| `lighting-moods-2026-10-24.jsonl` | Run `moods3`, a day later: `lcout` and `moodout` while `moodin` steps through 0/50/51/99/98/60/69/0 (tx records). Every mood matches its definition in the Loxone Config project, including the new mood 60 (`g2 b50`) |
| `lumitech-moods-2026-10-24.jsonl` | A Lighting Controller with a **Lumitech** output and a **Smart** output, stepped through moods 1–9 and off. Records `{ dir, id, type, payload }`: `lcana` (Analog, from the Lumitech output) carries the colour number, `lcout` (RGBW, from the Lumitech output) the same number as raw double bytes, `lcout2` (RGBW, from the Smart output) the mixed RGBW |
| `encrypted-analog.jsonl` | 40 consecutive 0x9F packets from the encrypted remote system `encrypte` (same port): output `analog` mirrors `rand` every 500 ms. The password is not stored here; `IciCipher.live.test.ts` decrypts them when `ICI_FIXTURE_PASSWORD` is set and otherwise checks only the envelope |
| `t5-buttons-2026-10-28.jsonl` | The T5 output `t5`, fed from the Liveview: middle, left top, left bottom, right top and right bottom pressed alone, then both top and both bottom buttons together, plus the 10 s re-sends of `0` |
| `fade-times-2026-10-28.jsonl` | Run `fade`: the Lighting Controller's `FadingTime` set over ICI (`fade`, tx records) to 1, 2 and 5 s, and `moodin` stepped through moods 10/11/12/off for each. Received: `sasc` (Smart single channel), `satw` (Smart tunable white) and `moodout`. The tx records are stamped when the send command returned, about a second after the packet left |
| `rgbw-fade-2026-10-28.jsonl` | Run `rgbw-fade`: `FadingTime` set over ICI (`fade`, tx records) to 0, 1 and 5 s, and `moodin` stepped through the static moods 1–4 and off for each. Received: `lcout2` (Smart RGBW output) and `moodout`. The tx records are stamped when the send command returned, about a second after the packet left |
| `sequence-2026-10-28.jsonl` | Mood 20 (a 4-colour sequence on the Smart output `lcout2`) switched on over ICI. Run `seq3`: step time 3 s, once at `FadingTime` 0 and once at 5 s. Run `seq6`: step time 6 s (changed in Loxone Config), `FadingTime` 0. Here the tx records are stamped just before the send |
| `rgbw-passthrough.jsonl` | RGBW payloads sent to input `inrgbw` (wired directly to output `outrgbw`) and the echoes, which are byte-identical, including out-of-range values |

Findings are documented in `../../../PROTOCOL.md`.
