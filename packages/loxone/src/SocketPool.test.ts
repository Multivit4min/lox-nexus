import assert from "node:assert/strict"
import { test } from "node:test"
import { IciSocket } from "@lox-nexus/ici"
import { SocketPool } from "./SocketPool.ts"

/** a free UDP port on loopback (bound and released) */
const freePort = async () => {
  const socket = new IciSocket()
  await socket.bind(0, "127.0.0.1")
  const port = socket.address()!.port
  await socket.close()
  return port
}

test("users of one address and port share a socket; the last release closes it", async () => {
  const pool = new SocketPool()
  const port = await freePort()
  const [a, b] = await Promise.all([pool.acquire(port, "127.0.0.1"), pool.acquire(port, "127.0.0.1")])
  assert.equal(a.socket, b.socket, "concurrent acquires share the bind")
  await a.release()
  await a.release()
  assert.equal(b.socket.isOpen, true, "a second release of the same lease does nothing")
  await b.release()
  assert.equal(b.socket.isOpen, false)
  const again = await pool.acquire(port, "127.0.0.1")
  assert.notEqual(again.socket, a.socket, "a new socket binds the freed port")
  await again.release()
})

test("a port taken elsewhere rejects without holding anything; the next acquire retries", async () => {
  const pool = new SocketPool()
  const blocker = new IciSocket()
  await blocker.bind(0, "127.0.0.1")
  const port = blocker.address()!.port
  await assert.rejects(pool.acquire(port, "127.0.0.1"), { code: "EADDRINUSE" })
  await blocker.close()
  const lease = await pool.acquire(port, "127.0.0.1")
  assert.equal(lease.socket.address()?.port, port)
  await lease.release()
})

test("port 0 is never shared", async () => {
  const pool = new SocketPool()
  const [a, b] = await Promise.all([pool.acquire(0, "127.0.0.1"), pool.acquire(0, "127.0.0.1")])
  assert.notEqual(a.socket.address()?.port, b.socket.address()?.port)
  await Promise.all([a.release(), b.release()])
})
