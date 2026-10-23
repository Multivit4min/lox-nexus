import assert from "node:assert/strict"
import { once } from "node:events"
import { after, before, describe, test } from "node:test"
import { StreamCloseCode } from "@lox-nexus/api"
import WebSocket from "ws"
import { SessionService } from "../auth/SessionService.ts"
import type { ApiClient } from "../test-support/ApiClient.ts"
import { TestApp } from "../test-support/TestApp.ts"

class ManualClock {
  time = Date.now()
  now() {
    return this.time
  }
}

describe("security regressions from the M3b review", { timeout: 10_000 }, () => {
  const clock = new ManualClock()
  let app: TestApp
  let admin: ApiClient

  before(async () => {
    app = await TestApp.start({ clock }, { NEXUS_PUBLIC_ORIGINS: "https://nexus.example" })
    admin = await app.admin()
  })
  after(() => app.dispose())

  const stream = (headers: Record<string, string> = {}, path = "/api/stream") =>
    new WebSocket(`${app.address.replace("http", "ws")}${path}`, { headers })

  test("percent-encoded API paths still require a session", async () => {
    const anonymous = app.client()
    assert.equal((await anonymous.get("/%61pi/miniservers")).statusCode, 401)
    assert.equal((await anonymous.post("/%61pi/bus/inject", { topic: "a/b", value: { type: "number", value: 1 } })).statusCode, 401)
    const socket = stream({}, "/%61pi/stream")
    const [, response] = await once(socket, "unexpected-response") as [unknown, { statusCode: number }]
    assert.equal(response.statusCode, 401)
  })

  test("parallel wrong logins from one address are throttled while they run", async () => {
    const client = app.client("10.1.1.1")
    const responses = await Promise.all(Array.from({ length: 12 }, () => client.post("/api/auth/login", { username: "admin", password: "wrong password" })))
    const codes = responses.map(r => r.statusCode)
    assert.equal(codes.filter(code => code === 401).length, 5)
    assert.equal(codes.filter(code => code === 429).length, 7)
  })

  test("setup after setup is refused (and throttled) without hashing every time", async () => {
    const client = app.client("10.1.1.2")
    const codes = []
    for (let i = 0; i < 7; i++) codes.push((await client.post("/api/auth/setup", { username: "x", password: "long enough" })).statusCode)
    assert.deepEqual(codes, [409, 409, 409, 409, 409, 429, 429])
  })

  test("an open stream is closed when its session is logged out", async () => {
    const client = app.client()
    await client.post("/api/auth/login", { username: "admin", password: "correct horse" })
    const socket = stream({ cookie: client.cookieHeader! })
    await once(socket, "open")
    const closed = once(socket, "close")
    await client.post("/api/auth/logout")
    const [code] = await closed as [number]
    assert.equal(code, StreamCloseCode.SESSION_ENDED)
  })

  test("the cookie is renewed when the session slides", async () => {
    const client = app.client()
    await client.post("/api/auth/login", { username: "admin", password: "correct horse" })
    clock.time += SessionService.TTL_MS * 0.75
    const response = await client.get("/api/auth")
    assert.ok(response.cookies.some(cookie => cookie.name === "nexus_session" && cookie.maxAge === SessionService.TTL_MS / 1000))
    clock.time -= SessionService.TTL_MS * 0.75
  })

  test("a configured public origin may change state, others may not", async () => {
    const ok = await admin.post("/api/bus/inject", { topic: "a/b", value: { type: "number", value: 1 } }, { origin: "https://nexus.example" })
    assert.equal(ok.statusCode, 204)
    const refused = await admin.post("/api/bus/inject", { topic: "a/b", value: { type: "number", value: 1 } }, { origin: "https://evil.example" })
    assert.equal(refused.statusCode, 403)
    const socket = stream({ cookie: admin.cookieHeader!, origin: "https://evil.example" })
    const [, response] = await once(socket, "unexpected-response") as [unknown, { statusCode: number }]
    assert.equal(response.statusCode, 403)
  })
})
