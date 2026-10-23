import assert from "node:assert/strict"
import { once } from "node:events"
import { describe, test } from "node:test"
import { IciSocket } from "./IciSocket.ts"

const bound = async () => {
  const socket = new IciSocket()
  await socket.bind(0, "127.0.0.1")
  return socket
}

describe("IciSocket", () => {
  test("sends and receives over loopback", async () => {
    const socket = await bound()
    try {
      const received = once(socket, "datagram")
      await socket.send(Buffer.from("ping"), socket.address()!.port, "127.0.0.1")
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

  test("can be closed and bound again (review #4)", async () => {
    const socket = await bound()
    await socket.close()
    await socket.bind(0, "127.0.0.1")
    assert.equal(socket.isOpen, true)
    await socket.close()
  })

  test("send on a closed socket rejects (review #10, #12)", async () => {
    const socket = new IciSocket()
    await assert.rejects(socket.send(Buffer.from("x"), 1, "127.0.0.1"), /not open/)
  })
})
