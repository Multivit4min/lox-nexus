import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { describe, test } from "node:test"
import { DataType } from "../DataType.ts"
import { DataPacket } from "../packet/DataPacket.ts"
import { Fixtures } from "../test-support/Fixtures.ts"
import { PacketDecoder } from "./PacketDecoder.ts"
import { PacketEncoder } from "./PacketEncoder.ts"

const decoder = new PacketDecoder()
const encoder = new PacketEncoder()
const live = Fixtures.datagrams("2026-10-23-live/data-packets.jsonl")

describe("PacketDecoder", () => {
  test("decodes every captured data packet", () => {
    for (const buffer of live) {
      const result = decoder.decode(buffer)
      assert.equal(result.kind, "data")
      if (result.kind !== "data") continue
      assert.equal(result.packet.sourceId, "server")
      assert.ok(["claude", "red"].includes(result.packet.targetId))
      assert.doesNotThrow(() => result.packet.value())
    }
  })

  test("re-encoding captured packets is byte-exact (review #1)", () => {
    for (const buffer of live) {
      const result = decoder.decode(buffer)
      if (result.kind === "data") assert.deepEqual(encoder.encodeData(result.packet), buffer)
    }
  })

  test("decodes the captured status packet", () => {
    const [buffer] = Fixtures.datagrams("2026-10-23-live/status-0x8d.jsonl")
    const result = decoder.decode(buffer!)
    assert.equal(result.kind, "status")
    if (result.kind === "status") assert.deepEqual([result.packet.sourceId, result.packet.deviceTag], ["server", "eb23a294"])
  })

  test("reports short and inconsistent datagrams as malformed (review #2)", () => {
    const valid = encoder.encodeData(DataPacket.of({ sourceId: "a", targetId: "b", packetId: "c" }, DataType.Text, "hello"))
    const cases = [Buffer.alloc(0), Buffer.from([0x9e]), valid.subarray(0, 37), valid.subarray(0, valid.length - 1)]
    for (const buffer of cases) assert.equal(decoder.decode(buffer).kind, "malformed", buffer.toString("hex"))
  })

  test("never throws on random or truncated input", () => {
    for (let i = 0; i < 2000; i++) {
      const buffer = randomBytes(i % 80)
      if (i % 3 === 0 && buffer.length > 0) buffer[0] = [0x9e, 0x9f, 0x8d][i % 9 / 3 | 0]!
      assert.doesNotThrow(() => decoder.decode(buffer))
    }
    for (const buffer of live.slice(0, 20)) {
      for (let cut = 0; cut <= buffer.length; cut++) assert.doesNotThrow(() => decoder.decode(buffer.subarray(0, cut)))
    }
  })

  test("reports unknown control bytes without logging (review #20)", () => {
    const result = decoder.decode(Buffer.from([0x42, 0, 0]))
    assert.deepEqual(result.kind === "unknown" && result.control, 0x42)
  })

  test("keeps unknown data types byte-exact", () => {
    const packet = new DataPacket("a", "b", "c", 0x7f, Buffer.from("cafe", "hex"))
    const result = decoder.decode(encoder.encodeData(packet))
    assert.ok(result.kind === "data" && result.packet.samePayload(packet) && result.packet.value() === undefined)
  })
})
