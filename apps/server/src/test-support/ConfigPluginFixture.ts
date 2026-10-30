import assert from "node:assert/strict"
import type { MiniserverDto, PluginInstanceDto, PluginSignalDto } from "@lox-nexus/api"
import { FakePluginTransport } from "@lox-nexus/core/testing"
import { Plugin, Sensor, secret, z } from "@lox-nexus/plugin-sdk"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { TestApp } from "./TestApp.ts"

/** Config export tests with plugin instances: a gateway plugin with a secret, a sensor wired to a Miniserver output. */
export class Reading extends Sensor<Gateway, object> {
  static readonly id = "reading"
  static readonly valueType = "number"
}

/** a device reached with a host and a secret token; refuses to start without the right token. Watches signals, like an exporter */
export class Gateway extends Plugin<{ host: string; token: string }> {
  // an optional secret, never set here, is not something an import should ask for
  static readonly config = z.object({ host: z.string().min(1), token: secret(z.string().min(1)), proxyPassword: secret(z.string()).optional() })
  static readonly sensors = [Reading]
  static readonly watches = { label: "Exported signals" }
  override start() {
    if (this.config.token !== "right") throw new Error("the gateway refused the token")
  }
}

export async function installation() {
  const description = await PluginTestHost.describe(Gateway)
  const app = await TestApp.start({ pluginTransport: new FakePluginTransport().add("gateway.ts", Gateway) }, {}, nexus =>
    nexus.pluginCatalog.setDevelopment({ pkg: { id: "gateway", name: "Gateway", entry: "gateway.ts", description }, version: "1.0.0" }))
  return { app, admin: await app.admin() }
}

/** a gateway instance with a sensor wired to a Miniserver input, and something in its store */
export async function configured() {
  const { app, admin } = await installation()
  const ms = (await admin.post("/api/miniservers", { slug: "haus", label: "Haus", host: "127.0.0.1", port: 7777, listenPort: 47321, ownId: "nexus", remoteId: "ms", enabled: false })).json<MiniserverDto>()
  const output = (await admin.post(`/api/miniservers/${ms.id}/signals`, { packetId: "pv", direction: "out", dataType: 1, label: "PV" })).json<{ id: string }>()
  const instance = (await admin.post("/api/plugin-instances", { plugin: "gateway", slug: "gw", label: "Gateway", config: { host: "gw.local", token: "right" } })).json<PluginInstanceDto>()
  const sensor = (await admin.post(`/api/plugin-instances/${instance.id}/signals`, { kind: "sensor", capability: "reading", params: {}, label: "Power", unit: "W" })).json<PluginSignalDto>()
  assert.equal((await admin.post("/api/wires", { label: "pv", sourceId: sensor.id, targetId: output.id })).statusCode, 201)
  app.app.persistence.pluginStore.set(instance.id, "pairing", { paired: true })
  return { app, admin, instance, sensor, ms, output }
}
