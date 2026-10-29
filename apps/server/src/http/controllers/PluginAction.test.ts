import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import type { PluginActionResultDto, PluginInstanceDto, PluginLogLineDto, PluginPackageDto } from "@lox-nexus/api"
import { FakePluginTransport } from "@lox-nexus/core/testing"
import { Action, Plugin, z } from "@lox-nexus/plugin-sdk"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import type { ApiClient } from "../../test-support/ApiClient.ts"
import { TestApp } from "../../test-support/TestApp.ts"

class PairAction extends Action<Plugin, { code: string }> {
  static readonly id = "pair"
  static readonly label = "Pair device"
  static readonly input = z.object({ code: z.string().regex(/^\d{11}$/, "11 digits") })
  run() {
    if (this.input.code === "00000000000") throw new Error("no device answered")
    return "Paired Kitchen plug"
  }
}

class WaitAction extends Action {
  static readonly id = "wait"
  // settles only when the plugin stops, like a pairing that is cut off
  run() {
    return new Promise<void>(resolve => this.onDispose(resolve))
  }
}

class PairingPlugin extends Plugin {
  static readonly actions = [PairAction, WaitAction]
}

describe("plugin actions API", { timeout: 10_000 }, () => {
  let app: TestApp
  let admin: ApiClient
  let instance: PluginInstanceDto
  const run = (action: string, input: unknown) => admin.post(`/api/plugin-instances/${instance.id}/actions/${action}`, { input })

  before(async () => {
    const description = await PluginTestHost.describe(PairingPlugin)
    const pluginTransport = new FakePluginTransport().add("pairing.ts", PairingPlugin)
    app = await TestApp.start({ pluginTransport }, {}, nexus =>
      nexus.pluginCatalog.setDevelopment({ pkg: { id: "pairing", name: "Pairing", entry: "pairing.ts", description }, version: "1.0.0" }))
    admin = await app.admin()
    instance = (await admin.post("/api/plugin-instances", { plugin: "pairing", slug: "home", label: "Home" })).json<PluginInstanceDto>()
  })
  after(() => app.dispose())

  test("the description lists the actions with their form", async () => {
    const plugins = (await admin.get("/api/plugins")).json<PluginPackageDto[]>()
    assert.deepEqual(plugins[0]?.description.actions?.map(action => [action.id, action.label, Object.keys(action.input.properties as object)]), [["pair", "Pair device", ["code"]], ["wait", "wait", []]])
  })

  test("an action answers with the plugin's message, and the log says who started it but not the input", async () => {
    const answer = await run("pair", { code: "12345678901" })
    assert.equal(answer.statusCode, 200, answer.body)
    assert.deepEqual(answer.json<PluginActionResultDto>(), { message: "Paired Kitchen plug" })
    const lines = (await admin.get(`/api/plugin-instances/${instance.id}/logs`)).json<PluginLogLineDto[]>().map(line => line.message)
    assert.ok(lines.includes("action \"Pair device\" started by admin"), lines.join("\n"))
    assert.ok(lines.includes("action \"Pair device\" done"))
    assert.ok(!lines.some(line => line.includes("Paired Kitchen plug")), "the answer may carry a code, so it isn't logged")
    assert.ok(!lines.some(line => line.includes("12345678901")))
  })

  test("refusals: invalid input or a failure 400, unknown action 404, a stopped instance 409", async () => {
    assert.equal((await run("pair", { code: "12" })).statusCode, 400)
    const failed = await run("pair", { code: "00000000000" })
    assert.deepEqual([failed.statusCode, failed.json<{ error: string }>().error], [400, "no device answered"])
    assert.equal((await run("nope", {})).statusCode, 404)
    assert.equal((await admin.post(`/api/plugin-instances/${instance.id}/stop`, {})).statusCode, 200)
    assert.equal((await run("pair", { code: "12345678901" })).statusCode, 409)
  })
})

describe("plugin actions that take too long or are cut off", { timeout: 10_000 }, () => {
  let app: TestApp
  let admin: ApiClient
  let instance: PluginInstanceDto
  const run = (action: string) => admin.post(`/api/plugin-instances/${instance.id}/actions/${action}`, { input: {} })

  before(async () => {
    const description = await PluginTestHost.describe(PairingPlugin)
    const pluginTransport = new FakePluginTransport().add("pairing.ts", PairingPlugin)
    app = await TestApp.start({ pluginTransport, pluginTimings: { actionMs: 300 } }, {}, nexus =>
      nexus.pluginCatalog.setDevelopment({ pkg: { id: "pairing", name: "Pairing", entry: "pairing.ts", description }, version: "1.0.0" }))
    admin = await app.admin()
    instance = (await admin.post("/api/plugin-instances", { plugin: "pairing", slug: "slow", label: "Slow" })).json<PluginInstanceDto>()
  })
  after(() => app.dispose())

  test("a timeout answers 503, and the action still running refuses a second one", async () => {
    const timedOut = await run("wait")
    assert.equal(timedOut.statusCode, 503, timedOut.body)
    const second = await run("wait")
    assert.deepEqual([second.statusCode, second.json<{ error: string }>().error], [400, "wait is still running"])
  })

  test("an action cut off by stopping the instance answers 503", async () => {
    await admin.post(`/api/plugin-instances/${instance.id}/stop`, {})
    await admin.post(`/api/plugin-instances/${instance.id}/start`, {})
    const running = run("wait")
    await new Promise(resolve => setTimeout(resolve, 50))
    await admin.post(`/api/plugin-instances/${instance.id}/stop`, {})
    const answer = await running
    assert.deepEqual([answer.statusCode, answer.json<{ error: string }>().error], [503, "the plugin stopped"])
  })
})
