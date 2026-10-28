import assert from "node:assert/strict"
import http from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, describe, mock, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { ScriptHarness } from "./test-support/ScriptHarness.ts"

const { logs, until } = ScriptHarness

/** resource types active now beyond the baseline (counted per type) */
function added(baseline: string[]) {
  const left = new Map<string, number>()
  for (const type of baseline) left.set(type, (left.get(type) ?? 0) + 1)
  return process.getActiveResourcesInfo().filter(type => {
    const count = left.get(type) ?? 0
    left.set(type, count - 1)
    return count <= 0
  })
}

/** a server that accepts requests and never answers; counts the requests the client gave up */
async function hangingServer() {
  const state = { requests: 0, closed: 0 }
  const server = http.createServer(request => {
    state.requests++
    request.socket.on("close", () => state.closed++)
  })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
  return { state, url, close: () => new Promise<void>(resolve => server.close(() => resolve())) }
}

describe("script lifecycle", () => {
  const harness = new ScriptHarness()
  afterEach(() => harness.cleanup())

  test("stopping clears timers and aborts requests in flight; a stop/start cycle leaves no handles", async () => {
    const server = await hangingServer()
    const script = `
      setInterval(() => nexus.set("tick", Date.now()), 50)
      setTimeout(() => nexus.set("late", 1), 3_600_000)
      fetch(${JSON.stringify(server.url)}).then(() => nexus.set("fetched", true), error => console.warn("fetch:", error.name))
    `
    const baseline = process.getActiveResourcesInfo()
    try {
      for (let round = 0; round < 2; round++) {
        const host = await harness.start(script)
        await until(() => server.state.requests === round + 1)
        const tick = await host.addSensor("number", { name: "tick" })
        await until(() => host.values(tick).length >= 2)
        assert.ok(added(baseline).includes("Timeout"), "the script's timers run")
        await harness.cleanup()
        await until(() => server.state.closed === round + 1)
        await until(() => added(baseline).length === 0).catch(() => assert.deepEqual(added(baseline), [], `round ${round}`))
      }
    } finally {
      await server.close()
    }
  })

  test("clearTimeout and clearInterval stop a timer; ids are numbers", async () => {
    mock.timers.enable({ apis: ["setTimeout", "setInterval"] })
    const host = await harness.start(`
      let n = 0
      const interval = setInterval(() => { n++; nexus.set("n", n); if (n === 3) clearInterval(interval) }, 1000)
      const timeout = setTimeout(() => nexus.set("cancelled", true), 500)
      clearTimeout(timeout)
      nexus.set("ids", typeof interval + typeof timeout)
    `)
    const n = await host.addSensor("number", { name: "n" })
    const cancelled = await host.addSensor("switch", { name: "cancelled" })
    for (let i = 0; i < 5; i++) mock.timers.tick(1000)
    assert.deepEqual(host.values(n), [1, 2, 3].map(value => Value.number(value)))
    assert.deepEqual(host.values(cancelled), [])
    assert.deepEqual(host.values(await host.addSensor("text", { name: "ids" })), [Value.string("numbernumber")])
  })

  test("a throwing timer callback is logged with the script line and the script keeps running", async () => {
    mock.timers.enable({ apis: ["setTimeout", "setInterval"] })
    const host = await harness.start("let n = 0\nsetInterval(() => {\n  n++\n  if (n === 1) null.boom\n  nexus.set(\"n\", n)\n}, 1000)\nsetTimeout(async () => { throw new Error(\"async\") }, 10)")
    const n = await host.addSensor("number", { name: "n" })
    mock.timers.tick(1000)
    mock.timers.tick(1000)
    await until(() => logs(host, "error").length === 2)
    assert.deepEqual(host.values(n), [Value.number(2)])
    assert.deepEqual(logs(host, "error").sort(), [
      "uncaught error in setInterval: line 4, column 21: TypeError: Cannot read properties of null (reading 'boom')",
      "uncaught error in setTimeout: line 7, column 32: async"
    ])
    assert.equal(host.status.status, "running")
  })

  test("a stop with requests in flight logs nothing and runs no more script code", async () => {
    const server = await hangingServer()
    try {
      const host = await harness.start(`
        setTimeout(async () => { await fetch(${JSON.stringify(server.url)}); console.info("after fetch") }, 1)
        fetch(${JSON.stringify(server.url)}).then(response => response.text())
        fetch(${JSON.stringify(server.url)}).catch(error => console.warn("caught", error.name))
      `, undefined, true)
      await until(() => server.state.requests === 3)
      await harness.cleanup()
      await until(() => server.state.closed === 3)
      assert.deepEqual(logs(host), [])
    } finally {
      await server.close()
    }
  })

  test("the signal of a Request aborts it", async () => {
    const server = await hangingServer()
    try {
      const host = await harness.start(`fetch(new Request(${JSON.stringify(server.url)}, { signal: AbortSignal.timeout(50) }))
        .catch(error => nexus.set("result", error.name))`)
      const result = await host.addSensor("text", { name: "result" })
      await until(() => host.values(result).length > 0)
      assert.deepEqual(host.values(result), [Value.string("TimeoutError")])
    } finally {
      await server.close()
    }
  })

  test("setTimeout refuses a callback that isn't a function", async () => {
    const host = await harness.start("try { setTimeout(\"code\", 1) } catch (error) { nexus.set(\"error\", error instanceof TypeError && error.message) }")
    const error = await host.addSensor("text", { name: "error" })
    assert.deepEqual(host.values(error), [Value.string("setTimeout: the callback must be a function")])
  })
})
