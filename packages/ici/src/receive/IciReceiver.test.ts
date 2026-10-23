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
const analog = (packetId: string, value: number, targetId = "claude") =>
  encoder.encodeData(DataPacket.of({ sourceId: "server", targetId, packetId }, DataType.Analog, value))

const setup = (options: Partial<ConstructorParameters<typeof IciReceiver>[1]> = {}) => {
  const socket = new IciSocket()
  const receiver = new IciReceiver(socket, { ownId: "claude", ...options })
  const data: DataEvent[] = []
  const events: string[] = []
  receiver.on("data", event => data.push(event))
  for (const name of ["foreign", "status", "malformed", "unknown", "encrypted"] as const) {
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

  test("marks repeats as unchanged, keyed by source and packet id (review #6)", () => {
    const { data, feed } = setup()
    feed(analog("rand", 1))
    feed(analog("rand", 1))
    feed(analog("rand", 2))
    feed(analog("other", 2))
    assert.deepEqual(data.map(event => [event.packet.packetId, event.value, event.changed]),
      [["rand", 1, true], ["rand", 1, false], ["rand", 2, true], ["other", 2, true]])
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

  test("dispose stops listening", () => {
    const { receiver, data, feed } = setup()
    receiver.dispose()
    feed(analog("rand", 1))
    assert.equal(data.length, 0)
  })
})
