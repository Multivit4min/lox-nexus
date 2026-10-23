import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { DataType } from "../DataType.ts"
import { PayloadCodecs } from "./PayloadCodecs.ts"
import { SmartRgbwCodec } from "./SmartRgbwCodec.ts"
import { T5Buttons } from "./T5Buttons.ts"

const roundTrip = <T extends DataType>(type: T, value: Parameters<ReturnType<typeof PayloadCodecs.for<T>>["encode"]>[0]) => {
  const codec = PayloadCodecs.for(type)
  return codec.decode(codec.encode(value))
}

describe("payload codecs", () => {
  test("digital and analog round-trip", () => {
    assert.equal(roundTrip(DataType.Digital, true), true)
    assert.equal(roundTrip(DataType.Digital, false), false)
    assert.equal(roundTrip(DataType.Analog, -12.345), -12.345)
  })

  test("text round-trips beyond 255 bytes (review #1)", () => {
    const long = "ä".repeat(200)
    assert.equal(roundTrip(DataType.Text, long), long)
    assert.equal(PayloadCodecs.for(DataType.Text).encode(long).length, 401)
    assert.equal(roundTrip(DataType.Text, ""), "")
  })

  test("rgbw keeps flags and uses 0.1 s fade units (live capture)", () => {
    const payload = Buffer.from("640906001e000040", "hex")
    const value = PayloadCodecs.for(DataType.SmartRgbw).decode(payload)
    assert.deepEqual(value, { red: 100, green: 9, blue: 6, white: 0, fadeTime: 3, flags: SmartRgbwCodec.FLAG_SEQUENCE_STEP })
    assert.deepEqual(PayloadCodecs.for(DataType.SmartRgbw).encode(value), payload)
  })

  test("rgbw rejects out-of-range and fractional channels (review #15)", () => {
    const codec = PayloadCodecs.for(DataType.SmartRgbw)
    const base = { red: 0, green: 0, blue: 0, white: 0, fadeTime: 0.2, flags: 0 }
    assert.throws(() => codec.encode({ ...base, red: 101 }), RangeError)
    assert.throws(() => codec.encode({ ...base, green: 50.5 }), RangeError)
    assert.throws(() => codec.encode({ ...base, fadeTime: -1 }), RangeError)
  })

  test("single channel and tunable white round-trip", () => {
    assert.deepEqual(roundTrip(DataType.SmartSingleChannel, { channel: 42, fadeTime: 1.5 }), { channel: 42, fadeTime: 1.5 })
    const tw = { temperature: 4000, brightness: 80, fadeTime: 0.2 }
    assert.deepEqual(roundTrip(DataType.SmartTunableWhite, tw), tw)
  })

  test("t5 decodes the old button codes as a bitmask (hypothesis)", () => {
    const codec = PayloadCodecs.for(DataType.T5)
    for (const [mask, oldCode] of [[1, 16368], [2, 16384], [4, 16400], [8, 16416], [16, 16432]]) {
      const payload = codec.encode({ buttons: mask! })
      assert.equal(payload.readUint16LE(6), oldCode)
    }
    assert.deepEqual(T5Buttons.of(codec.decode(codec.encode({ buttons: 5 }))).names(), ["left-upper", "middle"])
  })

  test("t5 rejects null and impossible masks (review #8)", () => {
    const codec = PayloadCodecs.for(DataType.T5)
    assert.throws(() => codec.encode(null as never), TypeError)
    assert.throws(() => codec.encode({ buttons: 32 }), RangeError)
  })

  test("every fixed-size codec rejects short payloads", () => {
    for (const codec of PayloadCodecs.all()) {
      const size = codec.size
      if (size !== undefined) assert.throws(() => codec.decode(Buffer.alloc(size - 1)), RangeError, codec.name)
    }
  })
})
