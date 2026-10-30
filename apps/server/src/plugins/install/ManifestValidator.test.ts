import assert from "node:assert/strict"
import { test } from "node:test"
import { FixtureBundle } from "../../test-support/install/FixtureBundle.ts"
import { InstallError } from "./InstallError.ts"
import { ManifestValidator } from "./ManifestValidator.ts"

const refused = (text: string, pattern: RegExp) =>
  assert.throws(() => ManifestValidator.parse(text), (error: unknown) => error instanceof InstallError && error.reason === "invalid-package" && pattern.test(error.message))

test("a valid manifest gives id, name, version, entry and icon", () => {
  assert.deepEqual(ManifestValidator.parse(FixtureBundle.manifest()), { id: "fixture", name: "Fixture", version: "1.0.0", entry: "dist/plugin.js", icon: "test" })
  assert.equal(ManifestValidator.parse(FixtureBundle.manifest({ version: "2.0.0-beta.1+build.5" })).version, "2.0.0-beta.1+build.5")
  assert.equal(ManifestValidator.parse(FixtureBundle.manifest({ type: undefined }, { entry: "plugin.mjs" })).entry, "plugin.mjs")
})

test("versions must be strict semver", () => {
  for (const version of ["1.0", "v1.0.0", "01.0.0", "1.0.0 ", "../1.0.0", "latest"]) refused(FixtureBundle.manifest({ version }), /semantic version/)
  refused(JSON.stringify({ type: "module", loxNexus: JSON.parse(FixtureBundle.manifest()).loxNexus }), /version/)
})

test("the entry must stay inside the package", () => {
  for (const entry of ["../x.js", "/abs.js", "./dist/plugin.js", "dist/../../x.js", "dist//plugin.js", "dist\\plugin.js", "dist/plugin.ts", "a\u0000.js"]) {
    refused(FixtureBundle.manifest({}, { entry }), /entry/)
  }
})

test("ids, names and icons are restricted; reserved ids are refused", () => {
  for (const id of ["Fixture", ".staging", "-x", "loxone", "system", "a".repeat(65), "a/b"]) refused(FixtureBundle.manifest({}, { id }), /id/)
  refused(FixtureBundle.manifest({}, { name: "" }), /name/)
  refused(FixtureBundle.manifest({}, { icon: "<svg>" }), /icon/)
  refused(FixtureBundle.manifest({}, { apiVersion: 2 }), /apiVersion 2 is newer than this Nexus reads \(1\): update Nexus/)
})

test("plugins must be ES modules", () => {
  refused(FixtureBundle.manifest({ type: "commonjs" }), /module/)
  refused(FixtureBundle.manifest({ type: undefined }), /module/)
})

test("broken JSON is refused; declaresPlugin tells plugins from other packages", () => {
  refused("{", /not valid JSON/)
  assert.equal(ManifestValidator.declaresPlugin(FixtureBundle.manifest()), true)
  assert.equal(ManifestValidator.declaresPlugin(JSON.stringify({ name: "x" })), false)
  assert.equal(ManifestValidator.declaresPlugin("{"), false)
})

test("a plugin may ask for a heap limit between 128 and 512 MB", () => {
  assert.equal(ManifestValidator.parse(FixtureBundle.manifest({}, { heapMb: 256 })).heapMb, 256)
  assert.equal("heapMb" in ManifestValidator.parse(FixtureBundle.manifest()), false)
  for (const heapMb of [64, 1024, 200.5, "256"]) refused(FixtureBundle.manifest({}, { heapMb }), /heapMb/)
})
