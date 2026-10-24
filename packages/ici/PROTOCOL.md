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
| 4–7 | 4 | Constant per Miniserver. Hypothesis: the tail of the MAC address, byte-reversed (`eb 23 a2 94` → `…94:A2:23:EB`; Loxone's MAC prefix is `50:4F:94`) | ⚠️ |
| 8–15 | 8 | Own ID of the sending Miniserver (`server`) | ✅ |
| 16–27 | 12 | `0x00` | ⚠️ |
| 28 | 1 | `0x64` (100), constant so far | ❓ |

**Observed on a live Miniserver (2026-10-23, `test/fixtures/2026-10-23-live/status-0x8d.jsonl`):**
- Interval about **278 s** (4 min 38 s), not about 7 minutes.
- Each status packet arrived **twice in the same millisecond**, probably once per remote system
  configured at this address (`claude` and `red`), because the packet carries no target ID.
- Bytes 4–7 were identical across captures, and identical to the example captured for the old
  library a year earlier. So it is not a counter or a timestamp.
- The packet is usable as a heartbeat. Treat a Miniserver as stale after missing two status packets
  (about 10 min) with no data packets in between.

To confirm the MAC hypothesis, compare against the serial number or MAC shown in Loxone Config.

## Data types

| Value | Type | Payload size | Status |
|---|---|---|---|
| `0x00` | DIGITAL | 1 | ✅ |
| `0x01` | ANALOG | 8 | ✅ |
| `0x02` | TEXT | variable | ✅ |
| `0x03` | T5 | 8 | ⚠️ hypothesis below |
| `0x04` | SmartActuatorRGBW | 8 | ⚠️ bytes 6–7 unknown |
| `0x05` | SmartActuatorSingleChannel | 8 | ⚠️ bytes 0–2 unknown |
| `0x06` | SmartActuatorTunableWhite | 8 | ⚠️ fade unit disputed, bytes 6–7 unknown |

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

### T5 ⚠️
The old library read a uint16 at offset 6, with button codes 16368, 16384, 16400, 16416 and 16432.
Those are `0x3FF0`, `0x4000`, `0x4010`, `0x4020` and `0x4030`: exactly the two high bytes of the
little-endian doubles **1, 2, 4, 8 and 16**.

**Hypothesis:** the payload is a Float64 LE holding a 5-bit button mask:

| Bit | Value | Button (from the old enum) |
|---|---|---|
| 0 | 1 | left upper |
| 1 | 2 | right upper |
| 2 | 4 | middle |
| 3 | 8 | left lower |
| 4 | 16 | right lower |

If this holds, pressing two buttons at once gives the sum (for example 3 = left upper + right upper),
which the old enum could not represent.

### SmartActuatorRGBW ⚠️
| Offset | Size | Field | Status |
|---|---|---|---|
| 0 | 1 | Red 0–100 | ✅ |
| 1 | 1 | Green 0–100 | ✅ |
| 2 | 1 | Blue 0–100 | ✅ |
| 3 | 1 | White 0–100 | ✅ |
| 4–5 | 2 | Fade time, uint16, units of 0.1 s | ✅ (default 0.2 s → `2`; sequence steps of 3.0 s → `30`) |
| 6–7 | 2 | Flags, uint16 LE. `0x4000` (bit 14) is set on lighting-sequence steps; other bits never seen | ⚠️ |

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
  static mood with a custom (longer) fade time also sets it, and whether a Smart Actuator behaves
  differently with and without it.

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
| 60 "test" | R0 G2 B50 | expected `g2 b50`, not captured yet | — |

The RGBW payload has no field for a colour temperature. For a Kelvin mood the Miniserver mixes
it into RGBW itself before sending: 4600 K becomes the white channel alone, and the warmer
4050 K adds a little red (7 %) to a dimmer white. So a receiver sees white-heavy RGBW for every
temperature mood, and real colours only for RGB moods. Turning that back into a temperature
(`Converter` rgbw → tunableWhite) can only be an estimate.

**Passthrough probe (2026-10-23).** RGBW packets were sent to a Miniserver input wired directly to
an RGBW output. Every payload came back **byte-identical** within about 30 ms: bytes 6–7 set to
`0001`, `0100` and `ffff`, fade values 0, 10 and 25, and out-of-range colours 101 and 255. A direct
input→output connection doesn't interpret or clamp the payload, so it can't explain bytes 6–7. That
is why the Lighting Controller capture above was needed.

Sending also showed that the Miniserver accepts input packets from any source port. It appears to
check only the sender's IP address.

### SmartActuatorSingleChannel ⚠️
| Offset | Size | Field | Status |
|---|---|---|---|
| 0–2 | 3 | Unknown, `0x00` so far | ❓ |
| 3 | 1 | Channel value 0–100 | ✅ |
| 4–5 | 2 | Fade time, uint16, units of 0.1 s | ⚠️ |
| 6–7 | 2 | Unknown | ❓ |

### SmartActuatorTunableWhite ⚠️
| Offset | Size | Field | Status |
|---|---|---|---|
| 0–1 | 2 | Colour temperature in Kelvin | ⚠️ |
| 2–3 | 2 | Brightness in % | ⚠️ |
| 4–5 | 2 | Fade time, uint16. The old doc says units of 0.2 s, the old code used 0.1 s | ❓ |
| 6–7 | 2 | Unknown | ❓ |

## Open questions and capture experiments

Run with `npm run ici-lab -- capture [--port <listenPort>]` (the port defaults to 61263; available from M1). It prints annotated
hex dumps and diffs each packet against the previous one with the same packet ID.

1. **T5 mask.** Press each T5 button alone, then two at a time, then hold one. Does the payload
   decode as the doubles 1/2/4/8/16 and their sums? What happens on release (back to 0)? Is there a
   long-press encoding?
2. **RGBW bytes 6–7.** `0x4000` appears on sequence steps (see the SmartActuatorRGBW section).
   Next, in this order:
   1. Give a static mood a long fade time (e.g. 5 s): does the flag appear?
   2. Change the speed of the sequence in mood 69: do the flag and the fade value change?
   3. Send a step with and without `0x4000` to a real RGBW smart actuator and watch how it behaves.
3. **Fade units.** Configure fade times of 1 s and 2 s on RGBW, SingleChannel and TunableWhite
   outputs, and read bytes 4–5.
4. **SingleChannel bytes 0–2, TunableWhite bytes 6–7.** Watch for any non-zero value during the
   experiments above.
5. **Header bytes 1–7, 16, 25, 34.** Do they ever change, for example with encryption, a different
   firmware or a Miniserver Gen 2?
6. **0x8D.** Offset 4–7 is constant (see above). Still open: confirm it against the Miniserver's
   serial number or MAC, and find out what byte 28 means.
7. **0x9F.** Layout confirmed for analog (see above). Open: the kind bytes of digital, text and
   the smart actuator types on our Miniserver (wire such outputs to `encrypte`); whether magic and
   kind are masked like the sequence; what magic/kind a Miniserver accepts from *us* (sending);
   handshakes (none seen in 40 s of receiving: a sending Miniserver apparently needs nothing
   from its receiver).
