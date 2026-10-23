import assert from "node:assert/strict"
import { once } from "node:events"
import { afterEach, beforeEach, describe, mock, test } from "node:test"
import { PacketDecoder } from "../codec/PacketDecoder.ts"
import { DataType } from "../DataType.ts"
import { IciReceiver } from "../receive/IciReceiver.ts"
import type { DatagramSender } from "../transport/IciSocket.ts"
import { IciSocket } from "../transport/IciSocket.ts"
import { RemotePeer } from "./RemotePeer.ts"

class RecordingSender implements DatagramSender {
  readonly sent: Buffer[] = []
  fail = false

  async send(buffer: Buffer) {
    if (this.fail) throw new Error("network down")
    this.sent.push(buffer)
  }

  values() {
    return this.sent.map(buffer => {
      const result = new PacketDecoder().decode(buffer)
      return result.kind === "data" ? [result.packet.packetId, result.packet.value()] : undefined
    })
  }
}

const options = { ownId: "claude", remoteId: "server", host: "127.0.0.1", port: 61263 }

describe("RemotePeer", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setInterval"] }))
  afterEach(() => mock.timers.reset())

  test("set() sends exactly once (review #18)", async () => {
    const sender = new RecordingSender()
    const peer = new RemotePeer(sender, options)
    await peer.output("pv", DataType.Analog).set(1.5)
    assert.deepEqual(sender.values(), [["pv", 1.5]])
    peer.close()
  })

  test("resends all outputs with a value on one interval (review #9)", async () => {
    const sender = new RecordingSender()
    const peer = new RemotePeer(sender, { ...options, resendInterval: 1000 })
    await peer.output("a", DataType.Digital).set(true)
    peer.output("unset", DataType.Analog)
    mock.timers.tick(2000)
    await Promise.resolve()
    assert.deepEqual(sender.values(), [["a", true], ["a", true], ["a", true]])
    peer.close()
  })

  test("close stops resends and rejects further sends (review #10)", async () => {
    const sender = new RecordingSender()
    const peer = new RemotePeer(sender, { ...options, resendInterval: 1000 })
    const output = peer.output("a", DataType.Digital)
    await output.set(true)
    peer.close()
    mock.timers.tick(5000)
    await assert.rejects(output.set(false), /closed/)
    assert.equal(sender.sent.length, 1)
  })

  test("rejects type clashes for the same packet id (review #11)", () => {
    const peer = new RemotePeer(new RecordingSender(), options)
    peer.output("x", DataType.SmartRgbw)
    assert.throws(() => peer.output("x", DataType.Analog), TypeError)
    peer.close()
  })

  test("the type byte on the wire comes from the output, not the value (review #11)", async () => {
    const sender = new RecordingSender()
    const peer = new RemotePeer(sender, options)
    await peer.output("buttons", DataType.T5).set({ buttons: 1 })
    await peer.output("level", DataType.Analog).set(1)
    assert.deepEqual(sender.sent.map(buffer => buffer.readUint8(37)), [DataType.T5, DataType.Analog])
    peer.close()
  })

  test("rejects a NaN resend interval instead of flooding the Miniserver", () => {
    assert.throws(() => new RemotePeer(new RecordingSender(), { ...options, resendInterval: Number.NaN }), RangeError)
  })

  test("reports failed resends as events instead of unhandled rejections (review #12)", async () => {
    const sender = new RecordingSender()
    const peer = new RemotePeer(sender, { ...options, resendInterval: 1000 })
    await peer.output("a", DataType.Digital).set(true)
    sender.fail = true
    const failed = once(peer, "sendError")
    mock.timers.tick(1000)
    const [error, packetId] = await failed
    assert.deepEqual([error.message, packetId], ["network down", "a"])
    peer.close()
  })
})

describe("RemotePeer over loopback", () => {
  test("a value set on one side arrives decoded on the other", async () => {
    const miniserver = new IciSocket()
    await miniserver.bind(0, "127.0.0.1")
    const receiver = new IciReceiver(miniserver, { ownId: "server" })
    const nexus = new IciSocket()
    await nexus.bind(0, "127.0.0.1")
    const peer = new RemotePeer(nexus, { ...options, port: miniserver.address()!.port, resendInterval: 0 })
    try {
      const arrived = once(receiver, "data")
      await peer.output("lcout", DataType.SmartRgbw).set({ red: 100, green: 9, blue: 6, white: 0, fadeTime: 3, flags: 0x4000 })
      const [event] = await arrived
      assert.deepEqual([event.packet.sourceId, event.packet.packetId, event.value],
        ["claude", "lcout", { red: 100, green: 9, blue: 6, white: 0, fadeTime: 3, flags: 0x4000 }])
    } finally {
      peer.close()
      receiver.dispose()
      await Promise.all([miniserver.close(), nexus.close()])
    }
  })
})
