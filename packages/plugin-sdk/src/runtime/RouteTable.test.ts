import assert from "node:assert/strict"
import { test } from "node:test"
import { RouteTable } from "./RouteTable.ts"

const request = (method: string, path: string) => ({ method, path, query: {}, headers: {}, body: "" })

test("exact routes, prefixes and any-method routes; the most specific wins", async () => {
  const routes = new RouteTable()
  routes.route("POST", "/github", () => ({ status: 200, body: "exact" }))
  routes.route("*", "/hooks/*", () => ({ status: 200, body: "any hooks" }))
  routes.route("GET", "/hooks/*", () => ({ status: 200, body: "get hooks" }))
  routes.route("POST", "/hooks/special/*", () => ({ status: 200, body: "special" }))
  routes.route("*", "/*", request => ({ status: 200, body: `fallback ${request.path}` }))

  const body = async (method: string, path: string) => (await routes.dispatch(request(method, path))).body
  assert.equal(await body("post", "/github"), "exact")
  assert.equal(await body("GET", "/github"), "fallback /github")
  assert.equal(await body("GET", "/hooks/door"), "get hooks")
  assert.equal(await body("PUT", "/hooks/door/bell"), "any hooks")
  assert.equal(await body("POST", "/hooks/special/x"), "special")
  assert.equal(await body("GET", "/hooks/special/x"), "get hooks")
  assert.equal(await body("DELETE", "/"), "fallback /")
  assert.equal(await body("GET", "/hooks"), "fallback /hooks")
})

test("without a match the answer is 404; duplicates are refused", async () => {
  const routes = new RouteTable()
  routes.route("GET", "/a/*", () => ({ status: 204 }))
  assert.equal((await routes.dispatch(request("GET", "/b"))).status, 404)
  assert.equal((await routes.dispatch(request("GET", "/a/x"))).status, 204)
  assert.throws(() => routes.route("get", "/a/*", () => ({ status: 200 })), /already registered/)
})

test("edge cases: trailing slash, the root, an exact any-method route, empty segments", async () => {
  const routes = new RouteTable()
  routes.route("GET", "/a/*", () => ({ status: 200, body: "a" }))
  routes.route("*", "/a", () => ({ status: 200, body: "exact any" }))
  routes.route("GET", "//*", () => ({ status: 200, body: "double" }))
  const body = async (method: string, path: string) => (await routes.dispatch(request(method, path))).body
  assert.equal(await body("GET", "/a/"), "a")
  assert.equal(await body("POST", "/a"), "exact any")
  assert.equal(await body("GET", "/a"), "exact any")
  assert.equal(await body("GET", "//x"), "double")
  assert.equal((await routes.dispatch(request("GET", "/"))).status, 404)
})

test("a very long path costs no more than a short one", async () => {
  const routes = new RouteTable()
  routes.route("POST", "/github", () => ({ status: 204 }))
  routes.route("*", "/hooks/*", () => ({ status: 204 }))
  const started = performance.now()
  for (let i = 0; i < 20; i++) {
    assert.equal((await routes.dispatch(request("GET", "/".repeat(16_000)))).status, 404)
    assert.equal((await routes.dispatch(request("GET", `/hooks${"/a".repeat(8_000)}`))).status, 204)
  }
  // the old per-segment matching took about a second for one such request
  assert.ok(performance.now() - started < 200, `took ${performance.now() - started} ms`)
})
