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
| `0x9F` | Data packet (encrypted, AES-128-CBC) | ⚠️ documented, not yet implemented |
| `0x8D` | Status packet, sent about every 7 minutes | ❓ fields mostly unknown |

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

### 0x9F: encrypted data packet ⚠️

```
9f 00 00 00 00 00 00 00 73 65 72 76 65 72 00 00 00 6e 65 78 75 73 00 00 00 00 02 9c bd db 6a 55 51 5f 2d 36 e0 c8 5b 2d 6b 17 71 44 21 54 86 22 6c 63 26 c2 8f dc ca 8e cf af 50
```

| Offset | Size | Field |
|---|---|---|
| 0 | 1 | Control byte `0x9F` |
| 1–25 | 25 | Same header as 0x9E (source ID at 8–15, target ID at 17–24) |
| 26 | 1 | Number of AES blocks that follow (16 bytes each, at least 2) |
| 27–42 | 16 | Block 0: IV |
| 43… | 16·(n−1) | Encrypted body |

Key = `SHA256(password)[0..15]`, AES-128-CBC.

The decrypted body mirrors the plain packet from offset 26 onwards:

| Offset | Size | Field | Status |
|---|---|---|---|
| 0–7 | 8 | Packet ID | ⚠️ |
| 8 | 1 | `0x00` | ⚠️ |
| 9–10 | 2 | Payload length | ⚠️ |
| 11 | 1 | Probably the data type (the old doc says "not included" and "unknown") | ❓ |
| 12… | n | Payload, then padding | ⚠️ |

The example above needs the password it was captured with before it can serve as a test vector.

### 0x8D: status packet ❓

```
8d 00 00 00 eb 23 a2 94 73 65 72 76 65 72 00 00 00 00 00 00 00 00 00 00 00 00 00 00 64
```

| Offset | Size | Field | Status |
|---|---|---|---|
| 0 | 1 | Control byte `0x8D` | ✅ |
| 1–3 | 3 | `0x00` | ❓ |
| 4–7 | 4 | Changes between packets (counter, uptime or timestamp?) | ❓ |
| 8–15 | 8 | Miniserver name / own ID | ⚠️ |
| 16–27 | 12 | `0x00` | ❓ |
| 28 | 1 | `0x64` (100), meaning unknown | ❓ |

Goal: decode enough of it to use as a heartbeat ("Miniserver alive").

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

Unknown data types must be preserved byte-exact (`RawCodec`) and reported, never dropped silently.

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
| 4–5 | 2 | Fade time, uint16, units of 0.1 s | ⚠️ |
| 6–7 | 2 | Unknown ("bits"), flags? | ❓ |

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

Run with `npm run ici-lab -- capture --port <listenPort>` (available from M1). It prints annotated
hex dumps and diffs each packet against the previous one with the same packet ID.

1. **T5 mask.** Press each T5 button alone, then two at a time, then hold one. Does the payload
   decode as the doubles 1/2/4/8/16 and their sums? What happens on release (back to 0)? Is there a
   long-press encoding?
2. **RGBW bytes 6–7.** In Loxone Config, change one thing at a time and capture after each change:
   - fade time
   - colour only, then white only
   - master off
   - scene change
   - lighting controller "mode"

   Which bits move?
3. **Fade units.** Configure fade times of 1 s and 2 s on RGBW, SingleChannel and TunableWhite
   outputs, and read bytes 4–5.
4. **SingleChannel bytes 0–2, TunableWhite bytes 6–7.** Watch for any non-zero value during the
   experiments above.
5. **Header bytes 1–7, 16, 25, 34.** Do they ever change, for example with encryption, a different
   firmware or a Miniserver Gen 2?
6. **0x8D.** Capture several status packets over an hour. Is offset 4–7 a counter or a timestamp?
   What is byte 28?
7. **0x9F.** Capture with a known password and decrypt it, to confirm the decrypted layout and
   whether offset 11 is the data type.
