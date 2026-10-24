import assert from "node:assert/strict"
import path from "node:path"
import { test } from "node:test"
import type { PluginInstanceDto, PluginSignalDto } from "@lox-nexus/api"
import { CounterPlugin, FakePluginTransport } from "@lox-nexus/core/testing"
import type { PluginDescription } from "@lox-nexus/plugin-sdk/wire"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import type { NexusApp } from "../../NexusApp.ts"
import { TestApp } from "../../test-support/TestApp.ts"

const withCounter = (description: PluginDescription) => (nexus: NexusApp) =>
  nexus.pluginCatalog.set({ pkg: { id: "counter", name: "Counter", entry: "counter.ts", description }, version: "1.0.0", source: "development" })

// every app is also disposed in a hook (disposing twice is fine), so a failing assertion can't
// leave a server running and keep the test run alive
test("instances and signals survive a restart; an instance whose plugin is gone is listed as unavailable", async t => {
  const dir = TestApp.tempDir()
  const options = () => ({ databaseFile: path.join(dir, "nexus.db"), pluginTransport: new FakePluginTransport().add("counter.ts", CounterPlugin) })
  const description = await PluginTestHost.describe(CounterPlugin)

  const first = await TestApp.start(options(), {}, withCounter(description))
  t.after(() => first.dispose())
  const admin = await first.admin()
  const instance = (await admin.post("/api/plugin-instances", { plugin: "counter", slug: "home", label: "Home", config: { token: "s3cret" } })).json<PluginInstanceDto>()
  const signal = (await admin.post(`/api/plugin-instances/${instance.id}/signals`, { kind: "sensor", capability: "value", params: { start: 3 }, label: "V" })).json<PluginSignalDto>()
  await first.dispose()

  const second = await TestApp.start(options(), {}, withCounter(description))
  t.after(() => second.dispose())
  const again = await second.login()
  const signals = (await again.get(`/api/plugin-instances/${instance.id}/signals`)).json<PluginSignalDto[]>()
  assert.deepEqual(signals.map(s => [s.id, s.topic]), [[signal.id, signal.topic]])
  assert.equal(second.app.signals.get(signal.id)?.topic, signal.topic, "registered before wires load")
  await second.dispose()

  const third = await TestApp.start({ databaseFile: path.join(dir, "nexus.db") })
  t.after(() => third.dispose())
  const listed = (await (await third.login()).get("/api/plugin-instances")).json<PluginInstanceDto[]>()
  assert.deepEqual(listed.map(i => [i.slug, i.state, i.config]), [["home", "unavailable", {}]], "without its plugin nobody knows what is secret: no config is shown")
  await third.dispose()
})
