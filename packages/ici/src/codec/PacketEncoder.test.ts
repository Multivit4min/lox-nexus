import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { DataType } from "../DataType.ts"
import { DataPacket } from "../packet/DataPacket.ts"
import { PacketEncoder } from "./PacketEncoder.ts"

const encoder = new PacketEncoder()
const address = { sourceId: "claude", targetId: "server", packetId: "inrgbw" }

describe("PacketEncoder", () => {
  test("matches the layout from PROTOCOL.md", () => {
    const buffer = encoder.encodeData(DataPacket.of(address, DataType.SmartRgbw,
      { red: 10, green: 20, blue: 30, white: 40, fadeTime: 1, flags: 0 }))
    const captured = "9e00000000000000636c61756465000000736572766572000000696e726762770000000800040a141e280a000000"
    assert.equal(buffer.toString("hex"), captured)
  })

  test("writes the payload length as uint16 (review #1)", () => {
    const buffer = encoder.encodeData(DataPacket.of(address, DataType.Text, "x".repeat(300)))
    assert.equal(buffer.readUint16LE(35), 301)
  })

  test("rejects payloads that can't fit into one UDP datagram", () => {
    const packet = new DataPacket("claude", "server", "big", DataType.Text, Buffer.alloc(65470))
    assert.throws(() => encoder.encodeData(packet), /UDP limit/)
    assert.throws(() => DataPacket.of(address, DataType.Text, "x".repeat(65469)), RangeError)
    assert.doesNotThrow(() => encoder.encodeData(DataPacket.of(address, DataType.Text, "x".repeat(65468))))
  })

  test("rejects ids that don't fit instead of truncating (review #14)", () => {
    const packet = new DataPacket("claude", "server", "much-too-long", DataType.Digital, Buffer.from([1]))
    assert.throws(() => encoder.encodeData(packet), RangeError)
  })
})
