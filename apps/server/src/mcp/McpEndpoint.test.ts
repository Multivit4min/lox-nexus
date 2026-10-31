import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import type { CreatedAccessTokenDto } from "@lox-nexus/api"
import type { ApiClient } from "../test-support/ApiClient.ts"
import { TestApp } from "../test-support/TestApp.ts"

const initialize = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } }

describe("the /mcp endpoint", { timeout: 20_000 }, () => {
  let app: TestApp
  let admin: ApiClient
  let token: string
  const bearer = (value = token) => ({ authorization: `Bearer ${value}` })
  const mcp = (body: unknown, headers: Record<string, string> = bearer(), client = app.client()) => client.post("/mcp", body, headers)

  before(async () => {
    app = await TestApp.start()
    admin = await app.admin()
    token = (await admin.post("/api/tokens", { currentPassword: "correct horse", name: "agent", scopes: [] })).json<CreatedAccessTokenDto>().token
  })
  after(() => app.dispose())

  test("a token initializes a session-less MCP conversation", async () => {
    const answer = await mcp(initialize)
    assert.equal(answer.statusCode, 200, answer.body)
    const { result } = answer.json<{ result: { protocolVersion: string; capabilities: object; serverInfo: { name: string } } }>()
    assert.equal(result.protocolVersion, "2025-06-18")
    assert.equal(result.serverInfo.name, "lox-nexus")
    assert.equal(answer.headers["mcp-session-id"], undefined, "stateless")
    assert.equal((await mcp({ jsonrpc: "2.0", method: "notifications/initialized" })).statusCode, 202)
  })

  test("only a token gets in: not the session cookie, not a token in the URL, not from another origin", async () => {
    assert.equal((await mcp(initialize, {}, admin)).statusCode, 401, "the browser session can't drive /mcp")
    assert.equal((await app.client().post(`/mcp?access_token=${token}`, initialize, bearer())).statusCode, 400)
    assert.equal((await mcp(initialize, { ...bearer(), origin: "http://evil.example" })).statusCode, 403)
    assert.equal((await mcp(initialize, bearer("nxp_not-a-real-token"))).statusCode, 401)
  })

  test("protocol errors: invalid JSON, an unknown version, a batch; GET has no stream", async () => {
    const raw = await app.client().post("/mcp", undefined, { ...bearer(), "content-type": "application/json" })
    assert.ok([400, 415].includes(raw.statusCode))
    const broken = await app.app.server!.app.inject({ method: "POST", url: "/mcp", headers: { ...bearer(), "content-type": "application/json" }, payload: "{not json" })
    assert.equal(broken.json<{ error: { code: number } }>().error.code, -32700)
    assert.equal((await mcp(initialize, { ...bearer(), "mcp-protocol-version": "1999-01-01" })).statusCode, 400)
    assert.equal((await mcp([initialize])).json<{ error: { code: number } }>().error.code, -32600)
    assert.equal((await app.client().get("/mcp", bearer())).statusCode, 405)
  })

  test("a revoked token is refused at once", async () => {
    const created = (await admin.post("/api/tokens", { currentPassword: "correct horse", name: "short-lived", scopes: [] })).json<CreatedAccessTokenDto>()
    assert.equal((await mcp(initialize, bearer(created.token))).statusCode, 200)
    await admin.delete(`/api/tokens/${created.accessToken.id}`)
    assert.equal((await mcp(initialize, bearer(created.token))).statusCode, 401)
  })

  test("wrong tokens are throttled per address, apart from logins", async () => {
    const elsewhere = app.client("192.0.2.77")
    const statuses: number[] = []
    for (let i = 0; i < 6; i++) statuses.push((await mcp(initialize, bearer(`nxp_guess${i}`), elsewhere)).statusCode)
    assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429])
    assert.equal((await elsewhere.post("/api/auth/login", { username: "admin", password: "correct horse" })).statusCode, 200, "the login counter is another one")
  })
})
