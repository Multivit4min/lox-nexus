import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import type { UserDto } from "@lox-nexus/api"
import type { ApiClient } from "../../test-support/ApiClient.ts"
import { TestApp } from "../../test-support/TestApp.ts"

const OWN = "correct horse"

describe("users API", { timeout: 20_000 }, () => {
  let app: TestApp
  let admin: ApiClient
  const users = async () => (await admin.get("/api/users")).json<UserDto[]>()
  const loginAs = async (username: string, password: string) => {
    const client = app.client()
    return { client, status: (await client.post("/api/auth/login", { username, password })).statusCode }
  }

  before(async () => {
    app = await TestApp.start()
    admin = await app.admin()
  })
  after(() => app.dispose())

  test("needs a session; lists the accounts, marking your own", async () => {
    assert.equal((await app.client().get("/api/users")).statusCode, 401)
    const [only] = await users()
    assert.deepEqual([only?.username, only?.you, only?.lastLoginAt], ["admin", true, undefined], "setup is no login")
  })

  test("adding asks for your own password; names are unique ignoring case; the new user can log in", async () => {
    assert.equal((await admin.post("/api/users", { currentPassword: "wrong one", username: "family", password: "family secret" })).statusCode, 403)
    const added = await admin.post("/api/users", { currentPassword: OWN, username: "family", password: "family secret" })
    assert.equal(added.statusCode, 201, added.body)
    assert.equal((await admin.post("/api/users", { currentPassword: OWN, username: "Family", password: "other secret" })).statusCode, 409)
    assert.equal((await loginAs("family", "family secret")).status, 200)
    const family = (await users()).find(user => user.username === "family")
    assert.ok(family && !family.you && family.lastLoginAt !== undefined)
  })

  test("setting someone's password ends their sessions; your own goes through Change password", async () => {
    const family = (await users()).find(user => user.username === "family")!
    const { client: session } = await loginAs("family", "family secret")
    const own = (await users()).find(user => user.you)!
    assert.equal((await admin.put(`/api/users/${own.id}/password`, { currentPassword: OWN, password: "a new one!" })).statusCode, 400)
    assert.equal((await admin.put(`/api/users/${family.id}/password`, { currentPassword: OWN, password: "family new" })).statusCode, 204)
    assert.equal((await session.get("/api/users")).statusCode, 401, "the old session ended")
    assert.equal((await loginAs("family", "family secret")).status, 401)
    assert.equal((await loginAs("family", "family new")).status, 200)
  })

  test("nobody deletes themselves; deleting another ends their sessions", async () => {
    const family = (await users()).find(user => user.username === "family")!
    const { client: session } = await loginAs("family", "family new")
    const own = (await users()).find(user => user.you)!
    assert.equal((await admin.delete(`/api/users/${own.id}`, { currentPassword: OWN })).statusCode, 409)
    assert.equal((await admin.delete(`/api/users/${family.id}`, { currentPassword: "wrong one" })).statusCode, 403)
    assert.equal((await admin.delete(`/api/users/${family.id}`, { currentPassword: OWN })).statusCode, 204)
    assert.equal((await session.get("/api/users")).statusCode, 401)
    assert.equal((await admin.delete(`/api/users/${family.id}`, { currentPassword: OWN })).statusCode, 404)
    assert.deepEqual((await users()).map(user => user.username), ["admin"])
  })

  test("wrong own passwords are throttled like logins, from the same address", async () => {
    const statuses: number[] = []
    for (let i = 0; i < 6; i++) statuses.push((await admin.post("/api/users", { currentPassword: "guess", username: `x${i}`, password: "whatever1" })).statusCode)
    assert.deepEqual(statuses, [403, 403, 403, 403, 403, 429])
    assert.equal((await loginAs("admin", OWN)).status, 429, "logins from the address wait too")
  })
})
