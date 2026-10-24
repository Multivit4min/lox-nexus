import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { test } from "node:test"
import type { PluginPackage } from "@lox-nexus/core"
import type { PluginDescription } from "@lox-nexus/plugin-sdk/wire"
import { LoggerFactory } from "../logging/LoggerFactory.ts"
import { TestApp } from "../test-support/TestApp.ts"
import { DevPluginLoader } from "./DevPluginLoader.ts"
import { PluginCatalog } from "./PluginCatalog.ts"

const description: PluginDescription = { config: {}, sensors: [], actuators: [] }

/** writes plugins/<name> with a manifest and src/index.ts */
const plugin = (dir: string, name: string, manifest: unknown) => {
  fs.mkdirSync(path.join(dir, name, "src"), { recursive: true })
  fs.writeFileSync(path.join(dir, name, "package.json"), JSON.stringify(manifest))
  fs.writeFileSync(path.join(dir, name, "src", "index.ts"), "export {}\n")
}

test("loads the plugins of a directory, skips broken ones and reloads one after its files change", async () => {
  const dir = TestApp.tempDir()
  plugin(dir, "fronius", { version: "1.2.0", loxNexus: { apiVersion: 1, id: "fronius", name: "Fronius", entry: "dist/plugin.js" } })
  plugin(dir, "future", { loxNexus: { apiVersion: 2, id: "future", name: "Future", entry: "dist/plugin.js" } })
  plugin(dir, "broken", { loxNexus: { apiVersion: 1, id: "broken", name: "Broken", entry: "dist/plugin.js" } })
  const described: string[] = []
  const describer = {
    describe: async (entry: string) => {
      described.push(path.basename(path.dirname(path.dirname(entry))))
      if (entry.includes("broken")) throw new Error("does not say hello")
      return description
    }
  }
  const catalog = new PluginCatalog()
  const changed: PluginPackage[] = []
  const loader = new DevPluginLoader(dir, describer, catalog, async pkg => void changed.push(pkg), LoggerFactory.silent())
  await loader.load()
  assert.deepEqual(catalog.list().map(e => [e.pkg.id, e.version, e.pkg.entry]), [["fronius", "1.2.0", path.join(dir, "fronius", "src", "index.ts")]])
  assert.deepEqual(described.sort(), ["broken", "fronius"], "a manifest for another API version is not even described")

  loader.watch()
  fs.writeFileSync(path.join(dir, "fronius", "src", "index.ts"), "export const changed = 1\n")
  const deadline = Date.now() + 5000
  while (changed.length === 0 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50))
  assert.deepEqual(changed.map(pkg => pkg.id), ["fronius"])
  await loader.dispose()
  fs.rmSync(dir, { recursive: true, force: true })
})
