import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, test } from "node:test"
import { FixtureBundle } from "../../test-support/install/FixtureBundle.ts"
import { ZipFixture } from "../../test-support/install/ZipFixture.ts"
import { InstallError } from "./InstallError.ts"
import { InstallLimits } from "./InstallLimits.ts"
import { ZipSource } from "./ZipSource.ts"

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function packageDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lox-nexus-zip-"))
  dirs.push(dir)
  return path.join(dir, "package")
}

async function refused(data: Buffer, pattern: RegExp, limits = new InstallLimits()) {
  const target = packageDir()
  await assert.rejects(new ZipSource(data, "plugin.zip", limits).fetch(target), (error: unknown) => {
    assert.ok(error instanceof InstallError, String(error))
    assert.ok(["invalid-package", "invalid-source"].includes(error.reason), error.reason)
    assert.match(error.message, pattern)
    return true
  })
  // nothing of a refused archive is written
  assert.equal(fs.existsSync(target), false)
}

const manifest = FixtureBundle.manifest()

test("installs package.json and the bundle, at the root or in one top-level folder", async () => {
  for (const prefix of ["", "fixture-1.0.0/"]) {
    const target = packageDir()
    const data = ZipFixture.zip({ [`${prefix}package.json`]: manifest, [`${prefix}dist/plugin.js`]: await FixtureBundle.bundle(), [`${prefix}dist/plugin.js.map`]: "{}", [`${prefix}README.md`]: "x", [`${prefix}src/index.ts`]: "x" })
    const fetched = await new ZipSource(data, "fixture.zip", new InstallLimits()).fetch(target)
    assert.equal(fetched.manifest.id, "fixture")
    assert.equal(fetched.origin.kind, "zip")
    assert.match(fetched.origin.kind === "zip" ? fetched.origin.archiveSha256 : "", /^[0-9a-f]{64}$/)
    // only the three files, never the rest of the archive
    assert.deepEqual(fs.readdirSync(target, { recursive: true }).map(String).sort(), ["dist", "dist/plugin.js", "dist/plugin.js.map", "package.json"])
  }
})

test("a __MACOSX wrapper next to the folder is ignored", async () => {
  const data = ZipFixture.zip({ "fixture/package.json": manifest, "fixture/dist/plugin.js": "x", "__MACOSX/fixture/._package.json": "x", "fixture/.DS_Store": "x" })
  assert.equal((await new ZipSource(data, "x.zip", new InstallLimits()).fetch(packageDir())).manifest.id, "fixture")
})

test("zip-slip, absolute and odd names are refused before anything is extracted", async () => {
  for (const name of ["../evil.js", "a/../../evil.js", "/etc/evil", "C:/evil.js", "a\\b.js", "a\u0001b.js"]) {
    await refused(ZipFixture.zip({ "package.json": manifest, "dist/plugin.js": "x", [name]: "x" }), /unsafe entry|not a usable ZIP/)
  }
})

test("symbolic links, encrypted entries and duplicates are refused", async () => {
  await refused(ZipFixture.zip({ "package.json": manifest, "dist/plugin.js": [Buffer.from("/etc/passwd"), { attrs: (0o120777 << 16) >>> 0, os: 3 }] }), /symbolic link/)
  const encrypted = ZipFixture.patchCentral(ZipFixture.zip({ "package.json": manifest, "dist/plugin.js": "x" }), (data, at) => data.writeUInt16LE(data.readUInt16LE(at + 8) | 1, at + 8))
  await refused(encrypted, /encrypted/)
  const twice = ZipFixture.patchCentral(ZipFixture.zip({ "package.json": manifest, "dist/plugin.js": "x", "package.jsoo": manifest }), (data, at) => {
    const length = data.readUInt16LE(at + 28)
    if (data.toString("latin1", at + 46, at + 46 + length) === "package.jsoo") data.write("package.json", at + 46, "latin1")
  })
  await refused(twice, /appears twice/)
})

test("too many entries, a zip bomb and a lying size are refused", async () => {
  const many: Record<string, string> = { "package.json": manifest, "dist/plugin.js": "x" }
  for (let i = 0; i < 5_000; i++) many[`f/${i}`] = ""
  await refused(ZipFixture.zip(many), /more than 5000 entries/)
  const bomb = ZipFixture.zip({ "package.json": manifest, "dist/plugin.js": new Uint8Array(51 * 1024 * 1024) })
  assert.ok(bomb.length < 200_000)
  await refused(bomb, /more than 50 MiB/)
  const lying = ZipFixture.patchCentral(ZipFixture.zip({ "package.json": manifest, "dist/plugin.js": new Uint8Array(10_000) }), (data, at) => {
    if (data.readUInt32LE(at + 24) === 10_000) data.writeUInt32LE(100, at + 24)
  })
  await refused(lying, /too many bytes/)
})

test("bad packages: no or two roots, no bundle, a folder as entry, an escaping entry, an oversized bundle", async () => {
  await refused(ZipFixture.zip({ "dist/plugin.js": "x" }), /package.json must be/)
  await refused(ZipFixture.zip({ "a/package.json": manifest, "b/package.json": manifest }), /package.json must be/)
  await refused(ZipFixture.zip({ "package.json": manifest }), /not in the archive/)
  await refused(ZipFixture.zip({ "package.json": FixtureBundle.manifest({}, { entry: "dist.js" }), "dist.js/x": "x" }), /not in the archive/)
  await refused(ZipFixture.zip({ "package.json": FixtureBundle.manifest({}, { entry: "../x.js" }), "dist/plugin.js": "x" }), /entry/)
  await refused(ZipFixture.zip({ "package.json": manifest, "dist/plugin.js": new Uint8Array(2048) }), /larger than 1 KiB/, new InstallLimits({ bundleBytes: 1024 }))
  await refused(Buffer.from("not a zip"), /not a usable ZIP/)
  await refused(await ZipFixture.plugin(), /too large/, new InstallLimits({ uploadBytes: 10 }))
})
