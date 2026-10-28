import assert from "node:assert/strict"
import { test } from "node:test"
import type { PluginDescription } from "@lox-nexus/plugin-sdk/wire"
import { PluginCatalog } from "./PluginCatalog.ts"

const description = { config: {}, sensors: [], actuators: [] } as unknown as PluginDescription
const entry = (id: string, name: string, entryFile: string) => ({ pkg: { id, name, entry: entryFile, description }, version: "1.0.0" })

test("a development copy hides the installed plugin with the same id until it is gone", () => {
  const catalog = new PluginCatalog()
  catalog.setInstalled(entry("fixture", "Fixture", "/installed.js"))
  catalog.setInstalled(entry("alpha", "Alpha", "/alpha.js"))
  assert.equal(catalog.get("fixture")?.source, "installed")
  assert.equal(catalog.shadowed("fixture"), false)

  catalog.setDevelopment(entry("fixture", "Fixture (dev)", "/src/index.ts"))
  assert.equal(catalog.get("fixture")?.pkg.entry, "/src/index.ts")
  assert.equal(catalog.get("fixture")?.source, "development")
  assert.equal(catalog.installed("fixture")?.pkg.entry, "/installed.js")
  assert.equal(catalog.shadowed("fixture"), true)
  assert.deepEqual(catalog.list().map(item => [item.pkg.id, item.source]), [["alpha", "installed"], ["fixture", "development"]])

  // uninstalling leaves the development copy
  catalog.removeInstalled("fixture")
  assert.equal(catalog.get("fixture")?.source, "development")
  assert.equal(catalog.shadowed("fixture"), false)
  assert.equal(catalog.installed("fixture"), undefined)
  assert.equal(catalog.get("missing"), undefined)
})
