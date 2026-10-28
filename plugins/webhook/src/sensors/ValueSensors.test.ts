import assert from "node:assert/strict"
import { afterEach, describe, mock, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { WebhookHarness } from "../test-support/WebhookHarness.ts"

const { call } = WebhookHarness
const json = { "content-type": "application/json" }
const form = { "content-type": "application/x-www-form-urlencoded" }

describe("value sensors", () => {
  const harness = new WebhookHarness()
  afterEach(async () => {
    await harness.cleanup()
    mock.timers.reset()
  })

  test("json: a path into the body, with or without a JSON content type", async () => {
    const host = await harness.start()
    const temp = await host.addSensor("number", { hook: "h", path: "rooms[1].temp" })
    const body = (temp: number) => JSON.stringify({ rooms: [{ temp: 19 }, { temp }] })
    assert.equal((await call(host, { hook: "h", body: body(21.5), headers: json })).status, 204)
    assert.equal((await call(host, { hook: "h", body: body(22), headers: { "content-type": "text/plain" } })).status, 204)
    assert.equal((await call(host, { hook: "h", body: body(23) })).status, 204)
    assert.deepEqual(host.values(temp), [Value.number(21.5), Value.number(22), Value.number(23)])
  })

  test("json: unreadable bodies and missing paths are a 400", async () => {
    const host = await harness.start()
    await host.addSensor("number", { hook: "h", path: "a" })
    const answer = async (body: string, headers = {}) => {
      const response = await call(host, { hook: "h", body, headers })
      return `${response.status} ${response.body.trim()}`
    }
    assert.equal(await answer("{not json"), "400 the body is not valid JSON")
    assert.equal(await answer(""), "400 the body is empty, expected JSON")
    assert.equal(await answer("a=1", form), "400 the body is form data, not JSON")
    assert.equal(await answer("{\"b\":1}"), "400 JSON path \"a\" not found")
    assert.equal(await answer("{\"a\":{\"x\":1}}"), "400 json a: expected a number, got an object")
  })

  test("query: a parameter, as text converted to the sensor's type", async () => {
    const host = await harness.start()
    const level = await host.addSensor("number", { hook: "h", method: "GET", source: "query", name: "level" })
    const name = await host.addSensor("text", { hook: "h", method: "GET", source: "query", name: "who" })
    assert.equal((await call(host, { hook: "h", method: "GET", query: { level: "21,5", who: "Anna" } })).status, 204)
    assert.deepEqual(host.values(level), [Value.number(21.5)])
    assert.deepEqual(host.values(name), [Value.string("Anna")])
    const missing = await call(host, { hook: "h", method: "GET", query: { level: "3" } })
    assert.equal(missing.status, 400)
    assert.equal(missing.body.trim(), "query parameter \"who\" is missing")
    assert.deepEqual(host.values(level).at(-1), Value.number(3), "the readable value is still taken")
  })

  test("text longer than 4096 characters is refused with a 400", async () => {
    const host = await harness.start()
    await host.addSensor("text", { hook: "h", source: "body" })
    assert.equal((await call(host, { hook: "h", body: "x".repeat(4096) })).status, 204)
    const long = await call(host, { hook: "h", body: "x".repeat(4097) })
    assert.equal(long.status, 400)
    assert.match(long.body, /longer than 4096/)
  })

  test("query: the parameter \"token\" can't be read into a signal", async () => {
    const host = await harness.start()
    await assert.rejects(host.addSensor("text", { hook: "h", source: "query", name: "token" }), /reserved/)
  })

  test("form: a field of a form-urlencoded body", async () => {
    const host = await harness.start()
    const on = await host.addSensor("switch", { hook: "h", source: "form", name: "state" })
    const note = await host.addSensor("text", { hook: "h", source: "form", name: "note" })
    const response = await call(host, { hook: "h", body: "state=ON&note=hello%20world+again", headers: form })
    assert.equal(response.status, 204)
    assert.deepEqual(host.values(on), [Value.boolean(true)])
    assert.deepEqual(host.values(note), [Value.string("hello world again")])
    const asJson = await call(host, { hook: "h", body: "{\"state\":\"off\"}", headers: json })
    assert.equal(asJson.status, 400)
    assert.match(asJson.body, /the body is JSON, not form data/)
    assert.equal((await call(host, { hook: "h", body: "note=x", headers: form })).status, 400, "state is missing")
  })

  test("body: the raw text", async () => {
    const host = await harness.start()
    const text = await host.addSensor("text", { hook: "h", method: "PUT", source: "body" })
    const number = await host.addSensor("number", { hook: "h", method: "PUT", source: "body" })
    assert.equal((await call(host, { hook: "h", method: "PUT", body: " 42 " })).status, 204)
    assert.deepEqual(host.values(text), [Value.string(" 42 ")])
    assert.deepEqual(host.values(number), [Value.number(42)])
  })

  test("number: strict conversion", async () => {
    const host = await harness.start()
    const number = await host.addSensor("number", { hook: "h", path: "v" })
    const send = async (v: unknown) => (await call(host, { hook: "h", body: JSON.stringify({ v }) })).status
    for (const [v, expected] of [[7, 7], ["21.5", 21.5], ["-3", -3], ["1e3", 1000], [".5", 0.5], ["12,25", 12.25], [true, 1], [false, 0]] as const) {
      assert.equal(await send(v), 204, String(v))
      assert.deepEqual(host.values(number).at(-1), Value.number(expected), String(v))
    }
    for (const v of ["", "abc", "20%", "1.234,5", "0x10", "Infinity", null, [1], { a: 1 }]) assert.equal(await send(v), 400, JSON.stringify(v))
  })

  test("switch: booleans, numbers and on/off words", async () => {
    const host = await harness.start()
    const state = await host.addSensor("switch", { hook: "h", path: "v" })
    const send = async (v: unknown) => (await call(host, { hook: "h", body: JSON.stringify({ v }) })).status
    for (const [v, expected] of [[true, true], [0, false], [2, true], ["off", false], ["Yes", true], ["0", false], ["TRUE", true]] as const) {
      assert.equal(await send(v), 204, String(v))
      assert.deepEqual(host.values(state).at(-1), Value.boolean(expected), String(v))
    }
    for (const v of ["maybe", null, {}]) assert.equal(await send(v), 400, JSON.stringify(v))
  })

  test("text: objects and arrays become their JSON, null is refused", async () => {
    const host = await harness.start()
    const text = await host.addSensor("text", { hook: "h", path: "v" })
    const send = async (v: unknown) => (await call(host, { hook: "h", body: JSON.stringify({ v }) })).status
    assert.equal(await send({ a: [1, 2] }), 204)
    assert.equal(await send(3.5), 204)
    assert.equal(await send(false), 204)
    assert.equal(await send(null), 400)
    assert.deepEqual(host.values(text), [Value.string("{\"a\":[1,2]}"), Value.string("3.5"), Value.string("false")])
  })

  test("the value stays; nothing resets it to false (old bug 1)", async () => {
    mock.timers.enable({ apis: ["setTimeout", "setInterval"] })
    const host = await harness.start()
    const temp = await host.addSensor("number", { hook: "h", path: "t" })
    const on = await host.addSensor("switch", { hook: "h", path: "on" })
    assert.equal((await call(host, { hook: "h", body: "{\"t\":21.5,\"on\":true}" })).status, 204)
    mock.timers.tick(3_600_000)
    assert.deepEqual(host.values(temp), [Value.number(21.5)])
    assert.deepEqual(host.values(on), [Value.boolean(true)])
  })

  test("params: a path is needed for json, a name for query and form, and paths are checked", async () => {
    const host = await harness.start()
    await assert.rejects(host.addSensor("number", { hook: "h" }), /path is empty/)
    await assert.rejects(host.addSensor("number", { hook: "h", path: "a.__proto__" }), /isn't allowed/)
    await assert.rejects(host.addSensor("number", { hook: "h", path: "a..b" }), /can't read the path/)
    await assert.rejects(host.addSensor("text", { hook: "h", source: "form" }), /needs a name/)
    await assert.rejects(host.addSensor("text", { hook: "h", source: "query" }), /needs a name/)
    await assert.rejects(host.addSensor("text", { hook: "Bad Name", source: "body" }))
    await assert.rejects(host.addSensor("text", { hook: "a".repeat(65), source: "body" }))
    await host.addSensor("text", { hook: "a".repeat(64), source: "body" })
    await host.addSensor("text", { hook: "0.door_bell-2", source: "body" })
  })
})
