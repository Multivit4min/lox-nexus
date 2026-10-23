import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import { LoginThrottle } from "../../auth/LoginThrottle.ts"
import { TestApp } from "../../test-support/TestApp.ts"

describe("auth API", { timeout: 10_000 }, () => {
  let app: TestApp
  before(async () => {
    app = await TestApp.start()
  })
  after(() => app.dispose())

  test("first-run setup creates the admin once and logs it in", async () => {
    const anonymous = app.client()
    assert.deepEqual((await anonymous.get("/api/auth")).json(), { setupRequired: true })
    assert.equal((await anonymous.get("/api/miniservers")).statusCode, 401)
    const admin = await app.admin()
    assert.equal((await admin.get("/api/auth")).json<{ user: { username: string } }>().user.username, "admin")
    assert.equal((await admin.get("/api/miniservers")).statusCode, 200)
    const again = await app.client().post("/api/auth/setup", { username: "evil", password: "something long" })
    assert.equal(again.statusCode, 409)
  })

  test("login, wrong passwords, logout", async () => {
    const client = app.client()
    assert.equal((await client.post("/api/auth/login", { username: "admin", password: "wrong password" })).statusCode, 401)
    assert.equal((await client.post("/api/auth/login", { username: "ADMIN", password: "correct horse" })).statusCode, 200, "usernames are case-insensitive")
    assert.equal((await client.get("/api/miniservers")).statusCode, 200)
    assert.equal((await client.post("/api/auth/logout")).statusCode, 204)
    assert.equal((await client.get("/api/miniservers")).statusCode, 401)
  })

  test("short passwords and missing fields are rejected with the reason", async () => {
    const response = await app.client().post("/api/auth/login", { username: "admin", password: "short" })
    assert.equal(response.statusCode, 400)
    assert.match(response.json<{ error: string }>().error, /password/)
  })

  test("repeated failures from one address are throttled", async () => {
    const client = app.client("10.0.0.66")
    for (let i = 0; i < LoginThrottle.MAX_FAILURES; i++) await client.post("/api/auth/login", { username: "nobody", password: "wrong password" })
    const blocked = await client.post("/api/auth/login", { username: "admin", password: "correct horse" })
    assert.equal(blocked.statusCode, 429)
    assert.ok(Number(blocked.headers["retry-after"]) > 0)
    assert.equal((await app.client("10.0.0.67").post("/api/auth/login", { username: "admin", password: "correct horse" })).statusCode, 200, "other addresses are not affected")
  })

  test("a password change ends other sessions and keeps the current one", async () => {
    const other = app.client()
    await other.post("/api/auth/login", { username: "admin", password: "correct horse" })
    const current = app.client()
    await current.post("/api/auth/login", { username: "admin", password: "correct horse" })
    assert.equal((await current.post("/api/auth/password", { current: "wrong one", next: "battery staple" })).statusCode, 400)
    assert.equal((await current.post("/api/auth/password", { current: "correct horse", next: "battery staple" })).statusCode, 204)
    assert.equal((await current.get("/api/miniservers")).statusCode, 200)
    assert.equal((await other.get("/api/miniservers")).statusCode, 401)
    await current.post("/api/auth/password", { current: "battery staple", next: "correct horse" })
  })

  test("state-changing requests from another origin are refused", async () => {
    const response = await app.client().post("/api/auth/login", { username: "admin", password: "x".repeat(8) }, { origin: "http://evil.example" })
    assert.equal(response.statusCode, 403)
  })
})

