import assert from "node:assert/strict"
import { afterEach, describe, test } from "node:test"
import { ScriptHarness } from "./test-support/ScriptHarness.ts"

const { logs, until } = ScriptHarness

describe("unhandled rejections", () => {
  const harness = new ScriptHarness()
  afterEach(() => harness.cleanup())

  test("are the script's, also from host promises, and are logged with the script line", async () => {
    const host = await harness.start("nexus.on(\"go\", () => {\n  new Response(\"{}\").json().then(() => { null.boom })\n  crypto.subtle.digest(\"nope\", new Uint8Array(1)).then(() => {})\n  Promise.reject(new Error(\"forgotten\"))\n})")
    harness.forwardRejections(host)
    const go = await host.addActuator("switch", { name: "go" })
    await host.actuate(go, { type: "boolean", value: true })
    await until(() => logs(host, "error").length === 3)
    assert.deepEqual(logs(host, "error").sort(), [
      "uncaught error in a promise without a rejection handler: line 2, column 47: TypeError: Cannot read properties of null (reading 'boom')",
      "uncaught error in a promise without a rejection handler: line 3, column 17: NotSupportedError: Unrecognized algorithm name",
      "uncaught error in a promise without a rejection handler: line 4, column 18: forgotten"
    ])
    assert.equal(host.status.status, "running")
    const panel = await host.panel()
    const script = panel?.type === "sections" ? panel.sections[0]?.panel : undefined
    const errors = script?.type === "keyValue" ? script.items.find(item => item.label === "Uncaught errors")?.value : undefined
    assert.equal(errors, "3", "counted as errors in the panel")
  })

  test("the plugin's override is what the SDK calls", async () => {
    const host = await harness.start("")
    host.unhandledRejection("plain text")
    assert.deepEqual(logs(host, "error"), ["uncaught error in a promise without a rejection handler: plain text"])
  })
})
