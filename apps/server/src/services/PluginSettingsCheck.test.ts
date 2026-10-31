import assert from "node:assert/strict"
import { test } from "node:test"
import { PluginRequestError, PluginUnavailableError, type ConfigCheck } from "@lox-nexus/core"
import { HttpError } from "../http/HttpError.ts"
import { PluginSettingsCheck } from "./PluginSettingsCheck.ts"

const catalog = { get: () => ({ pkg: { id: "p", name: "P", entry: "p.ts", description: { config: {}, sensors: [], actuators: [] } } }) as never }

function settings(check: () => Promise<ConfigCheck | undefined>) {
  const written: string[] = []
  const store = { load: () => ({ rooms: ["old"] }), set: (_id: string, key: string) => void written.push(`set ${key}`), delete: (_id: string, key: string) => void written.push(`delete ${key}`) }
  return { written, service: new PluginSettingsCheck({ check, test: async () => undefined, discover: async () => [] }, catalog, () => undefined, store) }
}

test("a plugin from before checks, or one that doesn't load, is saved unchecked; a failing check is a 502", async () => {
  assert.deepEqual(await settings(async () => undefined).service.prepare("p", { a: 1 }), { config: { a: 1 } })
  const unavailable = settings(async () => {
    throw new PluginUnavailableError("the plugin did not say hello within 10000 ms")
  })
  assert.deepEqual(await unavailable.service.prepare("p", { a: 1 }, { id: "i", plugin: "p", slug: "s", label: "", config: {}, configVersion: 2, enabled: true }), { config: { a: 1 }, configVersion: 2 })
  const throwing = settings(async () => {
    throw new PluginRequestError("migrateConfig failed")
  })
  await assert.rejects(throwing.service.prepare("p", {}), (error: HttpError) => error.status === 502 && /couldn't check the settings: migrateConfig failed/.test(error.message))
})

test("an edit of an older version returns the migration's store writes, applied only when asked", async () => {
  const { service, written } = settings(async () => ({ issues: [], config: { host: "x" }, version: 2, store: { set: { rooms: ["old"] }, delete: ["legacy"] } }))
  const prepared = await service.prepare("p", { host: "x" }, { id: "i", plugin: "p", slug: "s", label: "", config: { address: "x" }, enabled: true })
  assert.deepEqual(prepared, { config: { host: "x" }, configVersion: 2, storeWrites: { set: { rooms: ["old"] }, delete: ["legacy"] } })
  assert.deepEqual(written, [], "nothing before the instance is saved")
  service.applyStore("i", prepared.storeWrites)
  assert.deepEqual(written, ["set rooms", "delete legacy"])
})

test("Find on the network runs for a field the plugin marked, answers 404 for others and 502 when the plugin fails", async () => {
  const marked = { get: () => ({ pkg: { id: "p", name: "P", entry: "p.ts", description: { config: {}, sensors: [], actuators: [], discoverable: ["url"] } } }) as never }
  const asked: unknown[] = []
  const found = [{ label: "Home", value: "http://192.0.2.10:8123" }]
  const discover = async (_pkg: unknown, field: string, config: unknown) => (asked.push([field, config]), found)
  const service = new PluginSettingsCheck({ check: async () => undefined, test: async () => undefined, discover }, marked, () => undefined)
  assert.deepEqual(await service.discover("p", { field: "url", config: { token: "x" } }), { found })
  assert.deepEqual(asked, [["url", { token: "x" }]])
  await assert.rejects(service.discover("p", { field: "token" }), (error: HttpError) => error.status === 404)
  const failing = new PluginSettingsCheck({ check: async () => undefined, test: async () => undefined, discover: async () => {
    throw new PluginRequestError("no network")
  } }, marked, () => undefined)
  await assert.rejects(failing.discover("p", { field: "url" }), (error: HttpError) => error.status === 502 && /couldn't search: no network/.test(error.message))
})
