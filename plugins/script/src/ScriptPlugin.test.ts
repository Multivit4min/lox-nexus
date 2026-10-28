import assert from "node:assert/strict"
import { afterEach, describe, test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { ScriptPlugin } from "./ScriptPlugin.ts"
import { ScriptHarness } from "./test-support/ScriptHarness.ts"

const { logs } = ScriptHarness

describe("ScriptPlugin start", () => {
  const harness = new ScriptHarness()
  afterEach(() => harness.cleanup())

  test("the config field is a JavaScript code editor with the template as default", async () => {
    const description = await PluginTestHost.describe(ScriptPlugin)
    const script = (description.config as { properties: Record<string, Record<string, unknown>> }).properties.script
    assert.equal(script?.format, "code")
    assert.equal(script?.contentMediaType, "text/javascript")
    assert.match(String(script?.default), /nexus\.set\("time"/)
  })

  test("a syntax error fails the start with line and column", async () => {
    await assert.rejects(harness.start("const a = 1\n\nfoo(a, ))"), /line 3, column 9: Unexpected token '\)'/)
  })

  test("an endless loop at the top level fails the start instead of hanging it", async () => {
    const baseline = process.getActiveResourcesInfo().filter(type => type === "Timeout").length
    await assert.rejects(harness.start("setInterval(() => {}, 1000)\nwhile (true) {}"), /ran longer than 1000 ms, probably an endless loop/)
    await ScriptHarness.until(() => process.getActiveResourcesInfo().filter(type => type === "Timeout").length === baseline)
  })

  test("the template runs on a fresh instance", async () => {
    const host = await harness.start()
    const time = await host.addSensor("text", { name: "time" })
    assert.match((host.values(time)[0] as { value: string }).value, /^\d\d:\d\d$/)
    const light = await host.addActuator("switch", { name: "light" })
    const status = await host.addSensor("text", { name: "light-status" })
    await host.actuate(light, Value.boolean(true))
    assert.deepEqual(host.values(status).at(-1), Value.string("on"))
    assert.deepEqual(logs(host, "info"), ["light switched on"])
    assert.deepEqual(logs(host, "error"), [])
    assert.equal(host.status.status, "running")
  })

  test("the script sees no require, process, Buffer or module loading", async () => {
    const host = await harness.start(`
      nexus.set("missing", [typeof require, typeof process, typeof Buffer, typeof module, typeof __dirname].join())
      nexus.set("present", [typeof fetch, typeof setTimeout, typeof URL, typeof TextEncoder, typeof crypto.subtle,
        typeof structuredClone, typeof atob, typeof btoa, typeof AbortController, typeof URLSearchParams, typeof TextDecoder].join())
      try { await import("node:fs"); nexus.set("import", "loaded") } catch { nexus.set("import", "refused") }
    `)
    const missing = await host.addSensor("text", { name: "missing" })
    const present = await host.addSensor("text", { name: "present" })
    const imported = await host.addSensor("text", { name: "import" })
    assert.deepEqual(host.values(missing), [Value.string("undefined,undefined,undefined,undefined,undefined")])
    assert.deepEqual(host.values(present), [Value.string("function,function,function,function,object,function,function,function,function,function,function")])
    assert.deepEqual(host.values(imported), [Value.string("refused")])
  })

  test("a failing top level is logged with its line and degrades the instance, but handlers keep working", async () => {
    const host = await harness.start("nexus.on(\"in\", value => nexus.set(\"out\", value * 2))\nawait null\nconst x = null\nx.boom()")
    await ScriptHarness.until(() => host.status.status === "degraded")
    assert.match(host.status.message ?? "", /^the script's top level failed: line 4, column 3: TypeError: Cannot read properties of null/)
    const [line] = logs(host, "error")
    assert.match(line ?? "", /top level failed: line 4, column 3/)
    const out = await host.addSensor("number", { name: "out" })
    await host.actuate(await host.addActuator("number", { name: "in" }), Value.number(21))
    assert.deepEqual(host.values(out), [Value.number(42)])
  })

  test("a sync throw at the top level is a failed top level too, not a failed start", async () => {
    const host = await harness.start("undefinedFunction()")
    await ScriptHarness.until(() => host.status.status === "degraded")
    assert.match(host.status.message ?? "", /line 1, column 1: ReferenceError: undefinedFunction is not defined/)
  })
})
