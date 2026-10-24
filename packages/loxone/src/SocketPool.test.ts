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

// Cleanup runs in t.after hooks (releasing twice does nothing), so a failing assertion can't
// leave a socket open and keep the test run alive.

test("users of one address and port share a socket; the last release closes it", async t => {
  const pool = new SocketPool()
  const port = await freePort()
  const [a, b] = await Promise.all([pool.acquire(port, "127.0.0.1"), pool.acquire(port, "127.0.0.1")])
  t.after(() => Promise.all([a.release(), b.release()]))
  assert.equal(a.socket, b.socket, "concurrent acquires share the bind")
  await a.release()
  await a.release()
  assert.equal(b.socket.isOpen, true, "a second release of the same lease does nothing")
  await b.release()
  assert.equal(b.socket.isOpen, false)
  const again = await pool.acquire(port, "127.0.0.1")
  t.after(() => again.release())
  assert.notEqual(again.socket, a.socket, "a new socket binds the freed port")
})

test("a port taken elsewhere rejects without holding anything; the next acquire retries", async t => {
  const pool = new SocketPool()
  const blocker = new IciSocket()
  await blocker.bind(0, "127.0.0.1")
  t.after(() => blocker.close())
  const port = blocker.address()!.port
  await assert.rejects(pool.acquire(port, "127.0.0.1"), { code: "EADDRINUSE" })
  await blocker.close()
  const lease = await pool.acquire(port, "127.0.0.1")
  t.after(() => lease.release())
  assert.equal(lease.socket.address()?.port, port)
})

test("port 0 is never shared", async t => {
  const pool = new SocketPool()
  const [a, b] = await Promise.all([pool.acquire(0, "127.0.0.1"), pool.acquire(0, "127.0.0.1")])
  t.after(() => Promise.all([a.release(), b.release()]))
  assert.notEqual(a.socket.address()?.port, b.socket.address()?.port)
})
