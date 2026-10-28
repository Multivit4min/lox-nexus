import assert from "node:assert/strict"
import { describe, test } from "node:test"
import type { HttpRequest } from "@lox-nexus/plugin-sdk"
import { TokenGuard } from "./TokenGuard.ts"

const TOKEN = "s3cret-token-0123456789"
const request = (headers: Record<string, string> = {}, query: Record<string, string> = {}): HttpRequest =>
  ({ method: "POST", path: "/x", headers, query, body: "" })

describe("TokenGuard", () => {
  const guard = new TokenGuard(TOKEN)

  test("accepts the token as bearer, X-Webhook-Token header or token query parameter", () => {
    assert.equal(guard.check(request({ authorization: `Bearer ${TOKEN}` })), "ok")
    assert.equal(guard.check(request({ authorization: `bearer  ${TOKEN} ` })), "ok", "scheme is case-insensitive")
    assert.equal(guard.check(request({ "x-webhook-token": TOKEN })), "ok")
    assert.equal(guard.check(request({}, { token: TOKEN })), "ok")
  })

  test("a missing token is told apart from a wrong one", () => {
    assert.equal(guard.check(request()), "missing")
    assert.equal(guard.check(request({ authorization: `Basic ${TOKEN}` })), "missing", "only the Bearer scheme carries it")
    assert.equal(guard.check(request({ "x-webhook-token": "" }, { token: "" })), "missing")
  })

  test("wrong tokens of any length are refused without throwing (digests have equal length)", () => {
    for (const wrong of ["x", TOKEN.slice(0, -1), `${TOKEN}x`, TOKEN.toUpperCase(), "y".repeat(TOKEN.length), "z".repeat(4096)]) {
      assert.equal(guard.check(request({ authorization: `Bearer ${wrong}` })), "wrong", wrong)
      assert.equal(guard.check(request({ "x-webhook-token": wrong })), "wrong", wrong)
      assert.equal(guard.check(request({}, { token: wrong })), "wrong", wrong)
    }
  })

  test("one right token among wrong ones is enough", () => {
    assert.equal(guard.check(request({ authorization: "Bearer nope", "x-webhook-token": TOKEN })), "ok")
    assert.equal(guard.check(request({ authorization: "Bearer nope" }, { token: TOKEN })), "ok")
  })

  test("presented collects the tokens of all three places", () => {
    assert.deepEqual(TokenGuard.presented(request({ authorization: "Bearer a", "x-webhook-token": "b" }, { token: "c" })), ["a", "b", "c"])
  })
})
