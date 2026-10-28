import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, mock, test } from "node:test"
import type { PluginDescription } from "@lox-nexus/plugin-sdk/wire"
import { Persistence } from "../../db/Persistence.ts"
import type { StoredVersion } from "../../db/repositories/PluginPackageRepository.ts"
import { LoggerFactory } from "../../logging/LoggerFactory.ts"
import { TestApp } from "../../test-support/TestApp.ts"
import { PluginCatalog } from "../PluginCatalog.ts"
import { InstalledPluginLoader } from "./InstalledPluginLoader.ts"
import { InstallError } from "./InstallError.ts"
import type { StagedPackage } from "./PackageInspector.ts"
import { PluginDirectory } from "./PluginDirectory.ts"
import { PluginVersions } from "./PluginVersions.ts"
import { StagingArea } from "./StagingArea.ts"

const description: PluginDescription = { config: {}, sensors: [], actuators: [] } as unknown as PluginDescription
let root: string
let db: Persistence
let directory: PluginDirectory
let versions: PluginVersions
const describe = mock.fn(async () => description)
/** a description as this version stores it */
const stamped = JSON.stringify({ ...description, format: PluginVersions.FORMAT })

beforeEach(() => {
  root = TestApp.tempDir()
  db = new Persistence(":memory:", () => undefined)
  directory = new PluginDirectory(path.join(root, "plugins"))
  versions = new PluginVersions(directory, db.pluginPackages, { describe }, LoggerFactory.silent())
  describe.mock.resetCalls()
})
afterEach(() => {
  db.close()
  fs.rmSync(root, { recursive: true, force: true })
})

/** writes `<id>/<version>/dist/plugin.js` and returns its stored row */
async function installed(id: string, bundle = `export default ${JSON.stringify(id)}`, overrides: Partial<StoredVersion> = {}): Promise<StoredVersion> {
  const file = directory.entryFile(id, "1.0.0", "dist/plugin.js")
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, bundle)
  return {
    pluginId: id, version: "1.0.0", name: id, entry: "dist/plugin.js", source: { kind: "local", folder: "/x" },
    bundleSha256: await PluginDirectory.sha256(file), description: stamped, installedAt: 1, installedBy: "admin", ...overrides
  }
}

test("boot removes staging leftovers and orphan folders, and loads what the database says", async () => {
  db.pluginPackages.insert(await installed("good"))
  db.pluginPackages.insert(await installed("stale", "x", { description: "{not json" }))
  // stored by an older Nexus, which dropped description fields it didn't know (like `watches`)
  db.pluginPackages.insert(await installed("older", "y", { description: JSON.stringify(description) }))
  const missing = await installed("missing")
  fs.rmSync(directory.versionDir("missing", "1.0.0"), { recursive: true })
  db.pluginPackages.insert(missing)
  const changed = await installed("changed")
  fs.appendFileSync(directory.entryFile("changed", "1.0.0", "dist/plugin.js"), "// tampered")
  db.pluginPackages.insert(changed)
  await installed("orphan")
  fs.mkdirSync(path.join(directory.stagingDir, "leftover"), { recursive: true })
  // a folder that can't be read is skipped, not a reason to stop the boot
  fs.mkdirSync(path.join(directory.root, "locked", "1.0.0"), { recursive: true })
  fs.chmodSync(path.join(directory.root, "locked"), 0o000)
  const catalog = new PluginCatalog()

  await new InstalledPluginLoader(directory, new StagingArea(directory.stagingDir, LoggerFactory.silent()), db.pluginPackages, versions, catalog, LoggerFactory.silent()).load()

  fs.chmodSync(path.join(directory.root, "locked"), 0o700)
  assert.equal(fs.existsSync(directory.stagingDir), false)
  assert.equal(fs.existsSync(path.join(directory.root, "orphan")), false)
  assert.deepEqual(catalog.list().map(entry => entry.pkg.id).sort(), ["good", "older", "stale"])
  assert.equal(catalog.get("good")?.source, "installed")
  assert.equal(versions.problem("missing", "1.0.0"), "its files are missing")
  assert.match(versions.problem("changed", "1.0.0") ?? "", /changed on disk/)
  // an unreadable description, and one in an older format, is described again and stored
  assert.equal(describe.mock.callCount(), 2)
  assert.equal(db.pluginPackages.get("stale")?.active.description, stamped)
  assert.equal(db.pluginPackages.get("older")?.active.description, stamped)
})

function staged(packageDir: string): StagedPackage {
  return {
    packageDir, bundleSha256: "x", description,
    manifest: { id: "fixture", name: "Fixture", version: "1.0.0", entry: "dist/plugin.js" }, origin: { kind: "local", folder: "/x" }
  }
}

test("a full disk while moving in is no-space; a failed transaction removes the moved folder", async () => {
  const packageDir = path.join(root, "package")
  fs.mkdirSync(path.join(packageDir, "dist"), { recursive: true })
  fs.writeFileSync(path.join(packageDir, "dist", "plugin.js"), "x")
  const rename = mock.method(fs.promises, "rename", async () => {
    throw Object.assign(new Error("no space left on device"), { code: "ENOSPC" })
  })
  await assert.rejects(versions.commit(staged(packageDir), "admin"), (error: unknown) => error instanceof InstallError && error.reason === "no-space" && error.status === 507)
  rename.mock.restore()

  const insert = mock.method(db.pluginPackages, "insert", () => {
    throw new Error("database is locked")
  })
  await assert.rejects(versions.commit(staged(packageDir), "admin"), /database is locked/)
  insert.mock.restore()
  assert.equal(fs.existsSync(path.join(directory.root, "fixture")), false)
  assert.equal(db.pluginPackages.get("fixture"), undefined)
})

test("a leftover folder without a row doesn't block installing that version again", async () => {
  fs.mkdirSync(directory.versionDir("fixture", "1.0.0"), { recursive: true })
  fs.writeFileSync(path.join(directory.versionDir("fixture", "1.0.0"), "stale"), "x")
  const packageDir = path.join(root, "package")
  fs.mkdirSync(path.join(packageDir, "dist"), { recursive: true })
  fs.writeFileSync(path.join(packageDir, "dist", "plugin.js"), "x")
  await versions.commit(staged(packageDir), "admin")
  assert.deepEqual(fs.readdirSync(directory.versionDir("fixture", "1.0.0")), ["dist"])
  assert.equal(db.pluginPackages.get("fixture")?.active.version, "1.0.0")
})
