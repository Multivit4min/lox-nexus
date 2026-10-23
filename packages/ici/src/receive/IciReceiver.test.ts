import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { PacketEncoder } from "../codec/PacketEncoder.ts"
import { IciCipher } from "../crypto/IciCipher.ts"
import { DataType } from "../DataType.ts"
import { DataPacket } from "../packet/DataPacket.ts"
import { Fixtures } from "../test-support/Fixtures.ts"
import { IciSocket } from "../transport/IciSocket.ts"
import { IciReceiver, type DataEvent } from "./IciReceiver.ts"

const encoder = new PacketEncoder()
const from = Fixtures.remote()
const analog = (packetId: string, value: number, targetId = "claude", sourceId = "server") =>
  encoder.encodeData(DataPacket.of({ sourceId, targetId, packetId }, DataType.Analog, value))

const setup = (options: Partial<ConstructorParameters<typeof IciReceiver>[1]> = {}) => {
  const socket = new IciSocket()
  const receiver = new IciReceiver(socket, { ownId: "claude", ...options })
  const data: DataEvent[] = []
  const events: string[] = []
  receiver.on("data", event => data.push(event))
  for (const name of ["foreign", "status", "malformed", "unknown", "encrypted", "handshake"] as const) {
    receiver.on(name, () => events.push(name))
  }
  return { socket, receiver, data, events, feed: (buffer: Buffer) => socket.emit("datagram", buffer, from) }
}

describe("IciReceiver", () => {
  test("splits the live capture into ours and foreign (review #13)", () => {
    const { data, events, feed } = setup()
    Fixtures.datagrams("2026-10-23-live/data-packets.jsonl").forEach(feed)
    assert.ok(data.length > 0)
    assert.ok(data.every(event => event.packet.targetId === "claude"))
    assert.ok(events.includes("foreign"))
    assert.ok(!events.includes("malformed"))
  })

  test("marks repeats as unchanged per packet id (review #6)", () => {
    const { data, feed } = setup()
    feed(analog("rand", 1))
    feed(analog("rand", 1))
    feed(analog("rand", 2))
    feed(analog("other", 2))
    assert.deepEqual(data.map(event => [event.packet.packetId, event.value, event.changed]),
      [["rand", 1, true], ["rand", 1, false], ["rand", 2, true], ["other", 2, true]])
  })

  test("two Miniservers with the same packet id don't interfere (review #6, #13)", () => {
    const { data, feed } = setup()
    feed(analog("temp", 20, "claude", "house"))
    feed(analog("temp", 20, "claude", "garage"))
    feed(analog("temp", 20, "claude", "house"))
    assert.deepEqual(data.map(event => [event.packet.sourceId, event.changed]),
      [["house", true], ["garage", true], ["house", false]])
  })

  test("bounds memory for change detection", () => {
    const { data, feed } = setup({ maxTrackedPackets: 2 })
    feed(analog("a", 1))
    feed(analog("b", 1))
    feed(analog("c", 1))
    feed(analog("a", 1))
    assert.equal(data.at(-1)?.changed, true, "a was evicted, so it counts as new again")
  })

  test("a known type with a short payload is malformed", () => {
    const { events, feed } = setup()
    feed(encoder.encodeData(new DataPacket("server", "claude", "rand", DataType.Analog, Buffer.alloc(1))))
    assert.deepEqual(events, ["malformed"])
  })

  test("a throwing listener can't crash the receive path", () => {
    const { receiver, feed } = setup()
    const errors: unknown[] = []
    receiver.on("data", () => { throw new Error("consumer bug") })
    receiver.on("listenerError", error => errors.push(error))
    assert.doesNotThrow(() => feed(analog("rand", 1)))
    assert.equal((errors[0] as Error).message, "consumer bug")
    receiver.removeAllListeners("listenerError")
    assert.doesNotThrow(() => feed(analog("rand", 2)))
  })

  test("filters by source id when configured", () => {
    const { data, events, feed } = setup({ sourceIds: ["other"] })
    feed(analog("rand", 1))
    assert.equal(data.length, 0)
    assert.deepEqual(events, ["foreign"])
  })

  test("reports junk, unknown packets and status without throwing (review #2)", () => {
    const { events, feed } = setup()
    feed(Buffer.alloc(0))
    feed(Buffer.from([0x42]))
    Fixtures.datagrams("2026-10-23-live/status-0x8d.jsonl").slice(0, 1).forEach(feed)
    assert.deepEqual(events, ["malformed", "unknown", "status"])
  })

  test("decrypts 0x9F packets when a password is set", () => {
    const sealed = new IciCipher("pw").seal(DataPacket.of({ sourceId: "server", targetId: "claude", packetId: "rand" }, DataType.Analog, 7))
    const withPassword = setup({ password: "pw" })
    withPassword.feed(encoder.encodeEncrypted(sealed))
    assert.equal(withPassword.data[0]?.value, 7)
    const without = setup()
    without.feed(encoder.encodeEncrypted(sealed))
    assert.deepEqual(without.events, ["encrypted"])
  })

  test("reports decryption with the wrong password as malformed", () => {
    const sealed = new IciCipher("pw").seal(DataPacket.of({ sourceId: "server", targetId: "claude", packetId: "rand" }, DataType.Analog, 7))
    const wrong = setup({ password: "nope" })
    wrong.feed(encoder.encodeEncrypted(sealed))
    assert.deepEqual([wrong.data.length, wrong.events], [0, ["malformed"]])
  })

  test("reports handshakes addressed to us, ignores those between others", () => {
    const cipher = new IciCipher("pw")
    const { events, receiver, feed } = setup({ password: "pw" })
    const kinds: string[] = []
    receiver.on("handshake", kind => kinds.push(kind))
    feed(encoder.encodeEncrypted(cipher.handshake("challenge", "server", "claude")))
    feed(encoder.encodeEncrypted(cipher.handshake("challenge", "server", "someone")))
    assert.deepEqual([events, kinds], [["handshake"], ["challenge"]])
  })

  test("rejects invalid source ids up front", () => {
    assert.throws(() => setup({ sourceIds: ["far-too-long-id"] }), RangeError)
  })

  test("dispose stops listening", () => {
    const { receiver, data, feed } = setup()
    receiver.dispose()
    feed(analog("rand", 1))
    assert.equal(data.length, 0)
  })
})
