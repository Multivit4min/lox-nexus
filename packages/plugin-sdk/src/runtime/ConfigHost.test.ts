import assert from "node:assert/strict"
import { test } from "node:test"
import { z } from "zod"
import { Plugin } from "../plugin/Plugin.ts"
import { PluginTestHost } from "../testing/PluginTestHost.ts"

/** version 1 had `address` and a list of rooms in the config; version 2 has `host`, the rooms in the store */
class Versioned extends Plugin<{ host: string; port: number }> {
  static readonly config = z.object({ host: z.string().min(1), port: z.number().int().default(80) })
  static readonly configVersion = 2
  static migrateConfig({ config, from, store }: { config: unknown; from: number; store: { set(key: string, value: unknown): void } }) {
    if (from >= 2) return config
    const { address, rooms, ...rest } = config as { address?: string; rooms?: string[] }
    if (rooms) store.set("rooms", rooms)
    return { ...rest, host: address }
  }

  static async test(config: { host: string; port: number }) {
    if (config.host === "down") throw new Error(`${config.host}:${config.port} doesn't answer`)
    return `connected to ${config.host}:${config.port}`
  }
}

test("init migrates an older config, keeps what it moved to the store, and reports the result to be stored", async () => {
  const host = await PluginTestHost.start(Versioned, { config: { address: "pv.local", rooms: ["Hall"] }, configVersion: 1 })
  assert.deepEqual(host.migratedConfig, { config: { host: "pv.local" }, version: 2 })
  assert.deepEqual(host.store.rooms, ["Hall"])
  assert.equal(host.plugin.config.host, "pv.local")
  await host.stop()
  const current = await PluginTestHost.start(Versioned, { config: { host: "pv.local" }, configVersion: 2 })
  assert.equal(current.migratedConfig, undefined, "nothing to do for the current version")
  await current.stop()
  const old = await PluginTestHost.start(Versioned, { config: { address: "pv.local" } })
  assert.equal(old.migratedConfig, undefined, "a host without versions isn't told, but the plugin still runs migrated")
  await old.stop()
})

test("a settings check migrates and validates without starting; issues name their field", async () => {
  const fine = await PluginTestHost.checkConfig(Versioned, { address: "pv.local", rooms: ["Hall"] }, 1)
  assert.deepEqual(fine, { issues: [], config: { host: "pv.local" }, version: 2 })
  const bad = await PluginTestHost.checkConfig(Versioned, { host: "", port: "x" }, 2)
  assert.deepEqual(bad.issues.map(issue => issue.path), [["host"], ["port"]])
})

test("Test connection answers with the plugin's message, or its error; an invalid config fails first", async () => {
  assert.equal(await PluginTestHost.testConfig(Versioned, { host: "pv.local" }), "connected to pv.local:80")
  await assert.rejects(PluginTestHost.testConfig(Versioned, { host: "down", port: 8080 }), /down:8080 doesn't answer/)
  await assert.rejects(PluginTestHost.testConfig(Versioned, { host: "" }), /invalid config/)
  assert.equal((await PluginTestHost.describe(Versioned)).testable, true)
})

test("a check with the instance's store reports the migration's writes; the last write of a key wins", async () => {
  class Moving extends Plugin {
    static readonly configVersion = 2
    static migrateConfig({ config, store }: { config: unknown; store: { set(key: string, value: unknown): void; delete(key: string): void } }) {
      store.delete("a")
      store.set("a", 1)
      store.set("b", 2)
      store.delete("b")
      return config
    }
  }
  const checked = await PluginTestHost.checkConfig(Moving, {}, 1, { a: 0, b: 0 })
  assert.deepEqual(checked.store, { set: { a: 1 }, delete: ["b"] })
})
