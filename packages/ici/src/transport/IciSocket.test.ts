import assert from "node:assert/strict"
import type { Socket } from "node:dgram"
import { once } from "node:events"
import { describe, test } from "node:test"
import { IciSocket } from "./IciSocket.ts"

const bound = async () => {
  const socket = new IciSocket()
  await socket.bind(0, "127.0.0.1")
  return socket
}

const sendToSelf = (socket: IciSocket, text: string) => socket.send(Buffer.from(text), socket.address()!.port, "127.0.0.1")

describe("IciSocket", () => {
  test("sends and receives over loopback", async () => {
    const socket = await bound()
    try {
      const received = once(socket, "datagram")
      await sendToSelf(socket, "ping")
      const [buffer] = await received
      assert.equal(buffer.toString(), "ping")
    } finally {
      await socket.close()
    }
  })

  test("bind rejects on EADDRINUSE instead of crashing (review #3)", async () => {
    const first = await bound()
    const second = new IciSocket()
    try {
      await assert.rejects(second.bind(first.address()!.port, "127.0.0.1"), { code: "EADDRINUSE" })
      assert.equal(second.isOpen, false)
    } finally {
      await first.close()
    }
  })

  test("runtime socket errors become socketError events (review #3)", async () => {
    const socket = await bound()
    const raised = once(socket, "socketError")
    // reaching into the private dgram socket is the only way to simulate a runtime error
    ;(socket as unknown as { socket: Socket }).socket.emit("error", new Error("boom"))
    const [error] = await raised
    assert.equal(error.message, "boom")
    await socket.close()
  })

  test("rebinding does not duplicate datagram events (review #4)", async () => {
    const socket = await bound()
    await socket.close()
    await socket.bind(0, "127.0.0.1")
    const received: string[] = []
    const markerSeen = new Promise<void>(resolve => socket.on("datagram", buffer => {
      received.push(buffer.toString())
      if (buffer.toString() === "two") resolve()
    }))
    try {
      await sendToSelf(socket, "one")
      await sendToSelf(socket, "two")
      await markerSeen
      // with duplicated handlers "one" would appear twice before the marker
      assert.deepEqual(received, ["one", "two"])
    } finally {
      await socket.close()
    }
  })

  test("send after close rejects (review #10, #12)", async () => {
    const socket = await bound()
    await socket.close()
    await assert.rejects(socket.send(Buffer.from("x"), 9, "127.0.0.1"), /not open/)
  })

  test("a send still in flight is rejected by close instead of hanging (review #12)", async () => {
    const socket = await bound()
    const sending = socket.send(Buffer.from("x"), 9, "127.0.0.1")
    await socket.close()
    await assert.rejects(sending, /closed while sending/)
  })

  test("close during bind cancels it and leaves nothing open", async () => {
    const socket = new IciSocket()
    const binding = socket.bind(0, "127.0.0.1")
    await socket.close()
    await assert.rejects(binding, /closed while binding/)
    assert.equal(socket.isOpen, false)
  })

  test("a second bind while binding is refused", async () => {
    const socket = new IciSocket()
    const first = socket.bind(0, "127.0.0.1")
    await assert.rejects(socket.bind(0, "127.0.0.1"), /already bound or binding/)
    await first
    await socket.close()
  })
})
