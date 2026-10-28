import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { WebhookCall } from "./WebhookCall.ts"

const call = (body: string, contentType?: string) =>
  new WebhookCall({ method: "post", path: "/x", query: {}, headers: contentType ? { "content-type": contentType } : {}, body })

describe("WebhookCall", () => {
  test("reads the media type without parameters", () => {
    assert.equal(call("", "Application/JSON; charset=utf-8").contentType, "application/json")
    assert.equal(call("").contentType, "")
    assert.equal(call("").method, "POST")
  })

  test("JSON bodies parse whatever the content type, except form data", () => {
    assert.deepEqual(call("{\"a\":1}", "application/json").json(), { ok: true, data: { a: 1 } })
    assert.deepEqual(call("[1]", "text/plain").json(), { ok: true, data: [1] })
    assert.deepEqual(call("2").json(), { ok: true, data: 2 })
    assert.deepEqual(call("{\"a\":1}", "application/x-www-form-urlencoded").json(), { ok: false, problem: "the body is form data, not JSON" })
  })

  test("form bodies parse unless the content type says JSON", () => {
    const form = call("a=1&b=x%26y&a=2", "application/x-www-form-urlencoded; charset=utf-8").form()
    assert.ok(form.ok)
    assert.deepEqual(form.ok && [form.data.get("a"), form.data.get("b")], ["1", "x&y"])
    assert.equal(call("a=1").form().ok, true)
    assert.deepEqual(call("a=1", "application/vnd.api+json").form(), { ok: false, problem: "the body is JSON, not form data" })
  })

  test("parses once per call", () => {
    const shared = call("{\"a\":1}")
    assert.equal(shared.json(), shared.json())
  })

  test("query lookups don't reach the prototype", () => {
    assert.equal(call("").query("constructor"), undefined)
  })
})
