import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import type { AccessTokenDto, CreatedAccessTokenDto, UserDto } from "@lox-nexus/api"
import type { ApiClient } from "../../test-support/ApiClient.ts"
import { TestApp } from "../../test-support/TestApp.ts"

const OWN = "correct horse"

describe("access tokens API", { timeout: 20_000 }, () => {
  let app: TestApp
  let admin: ApiClient
  const tokens = async (client = admin) => (await client.get("/api/tokens")).json<AccessTokenDto[]>()
  const create = (body: Record<string, unknown>, client = admin) => client.post("/api/tokens", { currentPassword: OWN, name: "Claude Code", scopes: [], ...body })

  before(async () => {
    app = await TestApp.start()
    admin = await app.admin()
  })
  after(() => app.dispose())

  test("creating asks for your password; the token is shown once, read is always granted", async () => {
    assert.equal((await create({ currentPassword: "wrong" })).statusCode, 403)
    const answer = await create({ scopes: ["operate"] })
    assert.equal(answer.statusCode, 201, answer.body)
    const { token, accessToken } = answer.json<CreatedAccessTokenDto>()
    assert.match(token, /^nxp_[A-Za-z0-9_-]{43}$/)
    assert.deepEqual(accessToken.scopes, ["read", "operate"])
    const listed = await tokens()
    assert.deepEqual(listed.map(entry => entry.name), ["Claude Code"])
    assert.ok(!JSON.stringify(listed).includes(token), "never listed again")
  })

  test("a token is no key to the REST API, and only a session manages tokens", async () => {
    const { token } = (await create({ name: "script" })).json<CreatedAccessTokenDto>()
    const bearer = { authorization: `Bearer ${token}` }
    assert.equal((await app.client().get("/api/users", bearer)).statusCode, 401)
    assert.equal((await app.client().get("/api/tokens", bearer)).statusCode, 401)
  })

  test("revoking is immediate and only for your own tokens", async () => {
    const [first] = await tokens()
    await admin.post("/api/users", { currentPassword: OWN, username: "family", password: "family secret" })
    const family = app.client()
    await family.post("/api/auth/login", { username: "family", password: "family secret" })
    assert.equal((await family.delete(`/api/tokens/${first!.id}`)).statusCode, 404, "not theirs")
    assert.deepEqual(await tokens(family), [])
    assert.equal((await admin.delete(`/api/tokens/${first!.id}`)).statusCode, 204)
    assert.ok(!(await tokens()).some(entry => entry.id === first!.id))
  })

  test("any password change ends the user's tokens: their own, set by another user, or deleting them", async () => {
    const family = app.client()
    await family.post("/api/auth/login", { username: "family", password: "family secret" })
    await create({ currentPassword: "family secret" }, family)
    await create({ currentPassword: "family secret", name: "second" }, family)
    assert.equal((await tokens(family)).length, 2)
    const id = (await admin.get("/api/users")).json<UserDto[]>().find(user => user.username === "family")!.id
    await admin.put(`/api/users/${id}/password`, { currentPassword: OWN, password: "family new" })
    await family.post("/api/auth/login", { username: "family", password: "family new" })
    assert.deepEqual(await tokens(family), [], "Set password on the users page")
    await create({ currentPassword: "family new" }, family)
    await family.post("/api/auth/password", { current: "family new", next: "family newer" })
    assert.deepEqual(await tokens(family), [], "their own Change password")
    assert.ok((await tokens()).length > 0, "other users keep theirs")
  })

  test("at most 20 tokens per user", async () => {
    const have = (await tokens()).length
    for (let i = have; i < 20; i++) assert.equal((await create({ name: `t${i}` })).statusCode, 201)
    assert.equal((await create({ name: "one too many" })).statusCode, 409)
  })
})
