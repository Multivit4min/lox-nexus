# Loxone Intercommunication Protocol (ICI)

Working specification for `packages/ici`. Seeded from the `loxone-ici` repository's PROTOCOL.md
(same author), with offsets corrected and every unconfirmed field marked. **Update this file
whenever a capture confirms or refutes something**, and add the capture to `test/fixtures/`.

Legend: ✅ confirmed by tests or captures · ⚠️ believed, not yet verified against a capture ·
❓ unknown

All multi-byte values are little-endian unless stated otherwise. IDs are 8 bytes, NUL-padded ASCII.

## Packet types

| Control byte | Packet | Status |
|---|---|---|
| `0x9E` | Data packet (plain) | ✅ |
| `0x9F` | Data packet or handshake (encrypted) | ⚠️ implemented from a third-party reverse engineering, awaiting our own capture |
| `0x8D` | Status packet, sent about every 278 s | ⚠️ partially decoded |

### 0x9E: data packet

Example (ANALOG, from `server` to `remote`, packetId `analog`):

```
00 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45
9e 00 00 00 00 00 00 00 73 65 72 76 65 72 00 00 00 72 65 6d 6f 74 65 00 00 00 61 6e 61 6c 6f 67 00 00 00 08 00 01 00 00 00 20 d2 6f f0 bf
```

| Offset | Size | Field | Status |
|---|---|---|---|
| 0 | 1 | Control byte `0x9E` | ✅ |
| 1–7 | 7 | Unknown, always `0x00` so far | ❓ |
| 8–15 | 8 | Source ID: the sender's "Own ID" (Network Intercommunication) | ✅ |
| 16 | 1 | Always `0x00` so far | ❓ |
| 17–24 | 8 | Target ID: the receiver's ID as configured on the sender | ✅ |
| 25 | 1 | Always `0x00` so far | ❓ |
| 26–33 | 8 | Packet ID: identifier of the input or output | ✅ |
| 34 | 1 | Always `0x00` so far | ❓ |
| 35–36 | 2 | Payload length, **uint16** (the old library wrote only one byte) | ✅ |
| 37 | 1 | Data type (see below) | ✅ |
| 38… | n | Payload | per type |

The minimum valid length is 38 bytes plus the payload length. Anything shorter is malformed and
must be rejected without throwing.

**Observed on a live Miniserver (2026-10-23):**
- Bytes 1–7, 16, 25 and 34 were `0x00` in every one of several hundred packets.
- The Miniserver sends from UDP source port **65534**, not from its configured port.
- Values are sent on change. In addition, **every output is resent on a global 10.0 s tick**. This
  is one timer for the whole Miniserver, not a per-output timer, so an output that just changed can
  be resent only a few hundred ms later.
- Fast-changing values arrived at most about every 500 ms, although the program changed them more
  often.
- One Miniserver sends packets for several remote systems (different target IDs) to the same
  host and port. Receivers **must** filter on the target ID.
- A Digital output arrives as type `0x00` with a 1-byte payload, and an Analog output as type
  `0x01` with 8 bytes. Which one is sent depends on the output's type in Loxone Config.

### 0x9F: encrypted data packet ⚠️

Sources: a third-party reverse engineering of Miniserver-to-Miniserver captures (March 2026),
provided by the project owner, and **our own capture from the test Miniserver on 2026-10-23**
(remote system `encrypte`, known password, output `analog` mirroring `rand`; fixture
`test/fixtures/2026-10-23-live/encrypted-analog.jsonl`). Implemented in `IciCipher`, `IvBlock`,
`IvSequence`, `PayloadShape`. Nexus receives and decrypts live values end to end.

```
9f 00 00 00 00 00 00 00 73 65 72 76 65 72 00 00 00 6e 65 78 75 73 00 00 00 00 02 9c bd db 6a 55 51 5f 2d 36 e0 c8 5b 2d 6b 17 71 44 21 54 86 22 6c 63 26 c2 8f dc ca 8e cf af 50
```

| Offset | Size | Field | Status |
|---|---|---|---|
| 0 | 1 | Control byte `0x9F` | ✅ |
| 1–25 | 25 | Same header as 0x9E (source ID at 8–16, target ID at 17–25) | ✅ |
| 26 | 1 | Number of 16-byte blocks that follow, IV included: 1 = handshake, 2 = digital, 3+ = analog/text (the reverse engineering calls it "flag" 0x01/0x02/0x03). Analog: 3 ✅ | ⚠️ |
| 27–42 | 16 | IV: an **IV block encrypted with AES-ECB** (see below) | ✅ |
| 43… | 16·(n−1) | Body, AES-128-CBC with that IV | ✅ |

Key = `SHA256(password)[0..15]` ✅. Packets come from source port 65534, like 0x9E.

**IV block** (plaintext of the IV, AES-ECB):

| Offset | Size | Field | Status |
|---|---|---|---|
| 0–3 | 4 | Magic. Document: `4C 01 E2 C5`, "constant", used by the receiver to check the password. **Ours: `42 32 5D 2D`**, constant per sender, so it is not a universal constant | ⚠️ |
| 4 | 1 | Kind. Document: `0x2B` digital, `0x2A` analog, `0x29` text, `0x4E` challenge, `0x4D` response. **Ours: analog = `0xC0`.** The data type is not in the body, so the receiver needs this; ours differs, maybe masked like the sequence | ⚠️ |
| 5–11 | 7 | Random nonce | ✅ |
| 12–15 | 4 | **Sequence: a 32-bit packet counter (LE), XOR-ed with a constant mask.** Unmasked it rose by exactly 1 per packet over 80 packets. The document reads this as "1-byte counter + constant 3-byte device suffix", which is how it looks over a short time (the higher bytes change only on carries; the document's own examples have different "suffixes") | ✅ |

Because magic and kind differ per sender, Nexus checks the password by the body instead (a wrong
key never yields a valid NUL-terminated packet id), and takes the data type from a documented kind
or else from the payload shape (1 byte digital, NUL-terminated text, 8 bytes analog). Smart
actuator types can't be told from their shape; their kinds are unknown.

**Body** (plaintext):

| Offset | Size | Field |
|---|---|---|
| 0–8 | 9 | Packet ID, NUL-terminated ✅ |
| 9–10 | 2 | Payload length (uint16 LE) ✅ |
| 11… | n | Payload, as in 0x9E (analog: double LE ✅; text NUL-terminated, length includes the NUL ⚠️) |
| … | | Random padding to the block boundary, not a MAC ✅ |

Worked examples from the document (password unknown, so only the layout can be tested; see
`IciCipher.test.ts`): analog `CC1` = 42.0 → 75 bytes; digital `CC2` = on → 59 bytes; text
`CC3` = `TEST1` → 75 bytes.

**Handshake and session rules** (from the same document, **not implemented, to verify**):
- A Miniserver *receiving* encrypted data sends its sender a challenge (1 block, kind `0x4E`)
  about once a minute. The sender must answer with a response (kind `0x4D`). Until it does, all
  data is dropped, and the packet in flight when the challenge went out is lost too, so senders
  resend their last second of events.
- Senders send a 0x8D heartbeat every 10 s, which reduces how often challenges come.
- At start, one packet per data type should be sent ("priming"); otherwise the first packets of
  each type are dropped.
- The source port must be the ICI port (61263); packets from other ports are ignored silently.
  (Unencrypted packets are accepted from any port, see "Live findings".)
- Pace cyclic resends at about 30 ms between encrypted packets.
- Unknown: whether a Miniserver *sending* encrypted data expects anything from its receiver.

### 0x8D: status packet ❓

```
8d 00 00 00 eb 23 a2 94 73 65 72 76 65 72 00 00 00 00 00 00 00 00 00 00 00 00 00 00 64
```

| Offset | Size | Field | Status |
|---|---|---|---|
| 0 | 1 | Control byte `0x8D` | ✅ |
| 1–3 | 3 | `0x00` | ⚠️ |
| 4–7 | 4 | The last four bytes of the Miniserver's serial number (= its MAC), reversed: `eb 23 a2 94` → `…94:A2:23:EB`. Loxone's prefix `50:4F:94` is not sent | ✅ |
| 8–15 | 8 | Own ID of the sending Miniserver (`server`) | ✅ |
| 16–27 | 12 | `0x00` | ⚠️ |
| 28 | 1 | `0x64` (100), the same in every capture since 2026-10-23, across program changes | ❓ |

**Observed on a live Miniserver (2026-10-23, `test/fixtures/2026-10-23-live/status-0x8d.jsonl`):**
- Interval about **278 s** (4 min 38 s), not about 7 minutes.
- Each status packet arrived **twice in the same millisecond**, probably once per remote system
  configured at this address (`claude` and `red`), because the packet carries no target ID.
- Bytes 4–7 were identical across captures, and identical to the example captured for the old
  library a year earlier. So it is not a counter or a timestamp.
- The packet is usable as a heartbeat. Treat a Miniserver as stale after missing two status packets
  (about 10 min) with no data packets in between.

Bytes 4–7 were confirmed on 2026-10-28 against the serial number Loxone Config shows for the test
Miniserver (`50:4F:94:A2:23:EB`, an MS2331 on firmware 17.2.10.21). `StatusPacket.serialTail`
formats them that way.

## Data types

| Value | Type | Payload size | Status |
|---|---|---|---|
| `0x00` | DIGITAL | 1 | ✅ |
| `0x01` | ANALOG | 8 | ✅ |
| `0x02` | TEXT | variable | ✅ |
| `0x03` | T5 | 8 | ✅ |
| `0x04` | SmartActuatorRGBW | 8 | ⚠️ bytes 6–7 unknown |
| `0x05` | SmartActuatorSingleChannel | 8 | ✅ |
| `0x06` | SmartActuatorTunableWhite | 8 | ✅ except bytes 6–7 (constant `0x0800`) |

Unknown data types must be preserved byte-exact (`DataPacket` keeps the raw payload; `value()` returns `undefined`) and reported, never dropped silently.

### DIGITAL ✅
| Offset | Size | Field |
|---|---|---|
| 0 | 1 | `0` or `1` |

### ANALOG ✅
| Offset | Size | Field |
|---|---|---|
| 0–7 | 8 | Float64 LE |

### TEXT ✅
UTF-8 string, NUL-terminated. The payload length includes the terminator. Texts longer than 255
bytes need the uint16 length field (bug 1 in `docs/loxone-ici-review.md`).

### T5 ✅
The payload is a Float64 LE holding a 5-bit button mask: `0` when no button is pressed, `1`, `2`,
`4`, `8` or `16` for a single button. The old library read only the uint16 at offset 6, which is
why its button codes (16368, 16384, 16400, 16416, 16432 = `0x3FF0` … `0x4030`) are the high bytes
of these doubles.

Confirmed on a live Miniserver (2026-10-28, a T5 output fed from the Liveview):

- Each button alone gives exactly one of the doubles 1, 2, 4, 8, 16 (bytes 0–5 always zero).
- A press is one packet with the mask; the release is one packet with `0`. There is no separate
  long-press encoding: holding a button for 4.4 s sent the mask once and `0` on release, with no
  repeats in between.
- A double click is two plain press/release pairs (each press about 100–130 ms, about 100 ms apart).
- Like other outputs, the current value is re-sent every 10 s while nothing changes.
- Two buttons at once send the sum: both lower buttons gave `24`. Pressing both upper buttons gave
  `2`, then `3` 50 ms later, then `1` when the first finger let go: every change of the mask is its
  own packet.
- The positions below were confirmed by pressing each button alone (fixture
  `t5-buttons-2026-10-28.jsonl`); they match the old library's enum.

| Bit | Value | Button |
|---|---|---|
| 0 | 1 | left upper |
| 1 | 2 | right upper |
| 2 | 4 | middle |
| 3 | 8 | left lower |
| 4 | 16 | right lower |

### SmartActuatorRGBW ⚠️
| Offset | Size | Field | Status |
|---|---|---|---|
| 0 | 1 | Red 0–100 | ✅ |
| 1 | 1 | Green 0–100 | ✅ |
| 2 | 1 | Blue 0–100 | ✅ |
| 3 | 1 | White 0–100 | ✅ |
| 4–5 | 2 | Fade time, uint16, units of 0.1 s | ✅ (default 0.2 s → `2`; sequence steps of 3.0 s → `30`) |
| 6–7 | 2 | Flags, uint16 LE. `0x4000` (bit 14) is set on every lighting-sequence step and nowhere else; other bits never seen | ✅ when sent, ⚠️ effect on an actuator |

**Lighting Controller capture (2026-10-23, `test/fixtures/2026-10-23-live/lighting-moods.jsonl`).**
The RGBW output of a Lighting Controller was captured while its mood was switched over ICI:
- **Static moods** send exactly one packet per change, with `fade = 2` (0.2 s) and flags `0x0000`.
  Examples:

  | Mood | Packet |
  |---|---|
  | 50 | `w80` |
  | 51 | `r7 w37` |
  | 99 | `w100` |
  | 98 | `r100 g2 b2` |
  | 0 | all zero |
- **Animated mood (69, a 3-colour sequence).**
  - The first packet is the start colour with `fade = 2` and flags `0`.
  - About 200 ms later the sequence starts. Each step is one packet, roughly every 3.0 s, with
    `fade = 30` and flags **`0x4000`**: `r100 g9 b6` → `r100 g35 b0` → `r100 g13 b13` → repeat.
    Each step's fade lasts exactly as long as the step.
  - Switching to a static mood or off clears the flag immediately.
- **Hypothesis:** `0x4000` marks a *sequence step*. The actuator should keep fading continuously
  into the next step instead of treating it as a fresh scene change. Still unconfirmed: whether a
  Smart Actuator behaves differently with and without it.
- **A long fade doesn't set it (2026-10-28, `rgbw-fade-2026-10-28.jsonl`).** The Smart output of the
  Lighting Controller "claude" (`lcout2`) was switched through the static moods 1–4 and off with the
  controller's `FadingTime` at 0, 1 and 5 s (set over ICI). Every packet had flags `0x0000`, and
  bytes 4–5 carried the fade time (0, 10, 50). So the flag isn't about fading as such; only sequence
  steps set it.
- **Sequence timing (2026-10-28, `sequence-2026-10-28.jsonl`).** Mood 20 of "claude" is a 4-colour
  sequence on the Smart output (R100 → G80 B11 → G4 B100 → R100 G93 B58), captured with step times
  of 3 s (at `FadingTime` 0 and 5 s) and 6 s:
  - Switching to the mood sends the first colour as a plain scene change: the controller's
    `FadingTime` as fade, flags `0`.
  - The sequence starts once that fade is done: about 100 ms later at `FadingTime` 0, exactly 5.0 s
    later at 5 s.
  - Every further step, including the wrap back to the first colour, is one packet with flags
    `0x4000` and a fade equal to the **step time** (30 at 3 s, 60 at 6 s), sent every step time.
  - The 10 s re-sends repeat the current step packet, flag included. Leaving the mood clears the
    flag at once.

  So `0x4000` reads as "a sequence step: fade over the whole step". Whether a Smart Actuator does
  anything different with it is still open.

**Checked against the mood definitions (2026-10-24).** The Loxone Config project (read from
`/prog`) stores each mood's value for the RGBW output as a number. After subtracting `0x60000000`
it comes in one of two forms:
- `20bbbkkkk`: a colour temperature, brightness `bbb` % and `kkkk` Kelvin.
- `B·1000000 + G·1000 + R`: an RGB colour in percent.

Every captured packet matches its mood byte for byte, so the decoding is correct:

| Mood | Defined as | Packet | |
|---|---|---|---|
| 50 "Bright Motion" | 80 %, 4600 K | `w80` | ✅ |
| 51 "Dimm Motion" | 40 %, 4050 K | `r7 w37` | ✅ |
| 99 "Bright" | 100 %, 4600 K | `w100` | ✅ |
| 98 "Alarm" | R100 G2 B2 | `r100 g2 b2` | ✅ exact |
| 69 sequence | R100 G5 B5, steps R100 G9 B6 → R100 G35 B0 → R100 G13 B13, 3 s | the same steps | ✅ exact |
| 60 "test" | R0 G2 B50 | `g2 b50` (captured 2026-10-24, `lighting-moods-2026-10-24.jsonl`) | ✅ exact |

The RGBW payload has no field for a colour temperature. For a Kelvin mood the Miniserver mixes
it into RGBW itself before sending: 4600 K becomes the white channel alone, and the warmer
4050 K adds a little red (7 %) to a dimmer white. So a receiver sees white-heavy RGBW for every
temperature mood, and real colours only for RGB moods. Turning that back into a temperature
(`Converter` rgbw → tunableWhite) can only be an estimate.

Two temperature points are not enough to recover the formula. They fit a mix in which pure white
stands for 4600 K, the midpoint of the controller's 2700–6500 K range (`DayMinTemp`/`DayMaxTemp`),
and red rises with the mired distance from it: (1e6/4050 − 1e6/4600) / (1e6/2700 − 1e6/4600)
= 0.193, against red/white = 7/37 = 0.189. How brightness is split between the channels is still
open; test moods across 2700–6500 K at 100 % and 50 % would settle it.

**Kelvin moods and the Analog route (2026-10-24).** More moods (2200 K 70 %, 4000 K 50 %,
6000 K 90 %) confirm that a temperature leaves the Miniserver already mixed into RGBW, with
flags `0x0000`. White always equals the smallest of red+white, green+white and blue+white:

| Mood | Packet |
|---|---|
| 2200 K, 70 % | `r83 g30 w39` |
| 4000 K, 50 % | `r10 g1 w46` |
| 6000 K, 90 % | `g97 b97 w69` (the cool side adds cyan) |

**No field marks a temperature.** Bytes 6–7 are `0x0000` for Kelvin and RGB moods alike, and
`0x4000` only on sequence steps. Two attempts to get the controller's own value (`20bbbkkkk`
for a temperature, `BBBGGGRRR` for RGB) out of the Miniserver failed:
- A Lighting Controller's Smart output wired to an **Analog** intercommunication output (Loxone
  Config warns "invalid data type") sends only `1` while a mood is on and `0` for off.
- An Analog intercommunication input wired **directly** to an RGBW intercommunication output
  (`ktest` → `kout`) forwards the 8 payload bytes unchanged under the output's data type. The
  analog double `200504000` arrived as "w128, fade 0xe6e5, flags 0x41a7", which are just its
  bytes. A direct input → output link never converts, even across data types (see also the
  passthrough probe below).

With a Formula block (`I1`) between the input and an RGBW output it is the same: the output sends
data type 4 with the 8 bytes of the analog double. An RGBW intercommunication output converts only
what a Lighting Controller's **Smart** output gives it, never a plain number. Such a payload can be
recognised: read as a double it is a whole number in a Loxone colour range (`20bbbkkkk` or
`BBBGGGRRR`), while real RGBW payloads read as denormals or, for sequence steps, as non-integers
near 2. Two colour numbers can't be told apart from real payloads: 0 (all zero, which means off
either way) and 2 (red 2 %, whose double is `0000000000000040`, an empty sequence step).

**Lumitech outputs carry the colour number (2026-10-24, `lumitech-moods-2026-10-24.jsonl`).** A
Lighting Controller output of type **Lumitech** sends the controller's own value, so colour
temperatures survive exactly:

| Mood | Lumitech output → Analog (`lcana`) | Lumitech output → RGBW (`lcout`) | Smart output → RGBW (`lcout2`) |
|---|---|---|---|
| 2200 K, 70 % | `200702200` | the double's bytes (`w240 … flags 0x41a7`) | `r83 g30 w39` |
| 4000 K, 50 % | `200504000` | the double's bytes | `r10 g1 w46` |
| 6000 K, 90 % | `200906000` | the double's bytes | `g97 b97 w69` |
| 4700 K, 80 % | `200804700` | the double's bytes | `w80` |
| red 100 | `100` | the double's bytes (flags `0x4059`) | `r100` |
| green 80 | `80000` | the double's bytes | `g80 b3` (configured so) |
| off | `200004600` (0 %, the temperature kept) | the double's bytes | all zero |

**The Loxone colour number.**
- `20bbbkkkk`: a colour temperature, with brightness `bbb` in % and `kkkk` in Kelvin.
- Anything up to `100100100`: `BBBGGGRRR`, an RGB colour in %, with red in the lowest three digits.

Loxone Config stores mood values with the output type in the top bits: `0x50000000` for
Lumitech and `0x60000000` for Smart, plus the colour number.

**The Smart output's mix.** Both 4600 K and 4700 K at 80 % come out as pure white `w80`, so the
conversion is a table inside the Miniserver, not a formula. Only a Lumitech output gives exact
temperatures.

**Passthrough probe (2026-10-23).** RGBW packets were sent to a Miniserver input wired directly to
an RGBW output. Every payload came back **byte-identical** within about 30 ms: bytes 6–7 set to
`0001`, `0100` and `ffff`, fade values 0, 10 and 25, and out-of-range colours 101 and 255. A direct
input→output connection doesn't interpret or clamp the payload, so it can't explain bytes 6–7. That
is why the Lighting Controller capture above was needed.

Sending also showed that the Miniserver accepts input packets from any source port. It appears to
check only the sender's IP address.

### SmartActuatorSingleChannel ✅
| Offset | Size | Field | Status |
|---|---|---|---|
| 0–2 | 3 | Always `0x00` | ✅ |
| 3 | 1 | Channel value 0–100 | ✅ |
| 4–5 | 2 | Fade time, uint16, units of 0.1 s | ✅ |
| 6–7 | 2 | Always `0x00` | ✅ |

### SmartActuatorTunableWhite ✅
| Offset | Size | Field | Status |
|---|---|---|---|
| 0–1 | 2 | Colour temperature in Kelvin, uint16 | ✅ |
| 2–3 | 2 | Brightness in %, uint16 (byte 3 is always 0) | ✅ |
| 4–5 | 2 | Fade time, uint16, units of 0.1 s (not 0.2 s as the old doc said) | ✅ |
| 6–7 | 2 | Always `00 08` (uint16 LE `0x0800`), also when off and at fade 0 | ❓ meaning |

**Fade time run (2026-10-28, `test/fixtures/2026-10-23-live/fade-times-2026-10-28.jsonl`).** The
Lighting Controller "claude" has a Smart single channel output (`sasc`) and a Smart tunable white
output (`satw`), with moods 10/11/12 = 80/60/40 % and 4600/4000/3000 K. Its `FadingTime` input was
driven over ICI (input `fade`) with 1, 2 and 5 s, and `moodin` stepped through 10, 11, 12 and off
for each:

- Bytes 4–5 read 10, 20 and 50 on both outputs: the unit is 0.1 s, as for RGBW.
- Every packet matches its mood definition; the unknown single channel bytes stay 0.
- "Off" sends brightness 0 and **keeps the last temperature**, like the Lumitech output.
- The Miniserver sends the target value once, with the fade time; it doesn't send intermediate
  steps. The actuator fades by itself.
- Our encoder writes `0x0000` at tunable white bytes 6–7. Whether a receiver needs `0x0800` can only
  be checked with a real tunable white actuator.

## Open questions and capture experiments

Run with `npm run ici-lab -- capture [--port <listenPort>]` (the port defaults to 61263; available from M1). It prints annotated
hex dumps and diffs each packet against the previous one with the same packet ID.

1. **T5.** Answered, see the T5 section.
2. **RGBW bytes 6–7.** `0x4000` appears on sequence steps (see the SmartActuatorRGBW section).
   When it is sent is settled (2026-10-28): on every sequence step, with the step time as fade;
   never on static moods, whatever the fade. Open: send a step with and without `0x4000` to a real
   RGBW smart actuator and watch how it behaves.
3. **Fade units.** Answered: 0.1 s for RGBW, SingleChannel and TunableWhite.
4. **TunableWhite bytes 6–7.** Always `0x0800` from the Miniserver. Open: what it means, and whether
   a real tunable white actuator behaves differently when we send `0x0000`.
5. **Header bytes 1–7, 16, 25, 34.** Do they ever change, for example with encryption, a different
   firmware or a Miniserver Gen 2?
6. **0x8D.** Offset 4–7 is the serial number (see above). Still open: what byte 28 means.
7. **0x9F.** Layout confirmed for analog (see above). Open: the kind bytes of digital, text and
   the smart actuator types on our Miniserver (wire such outputs to `encrypte`); whether magic and
   kind are masked like the sequence; what magic/kind a Miniserver accepts from *us* (sending);
   handshakes (none seen in 40 s of receiving: a sending Miniserver apparently needs nothing
   from its receiver).
