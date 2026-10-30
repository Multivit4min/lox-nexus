import assert from "node:assert/strict"
import { test } from "node:test"
import { VersionChange } from "./VersionChange.ts"

test("versions compare by semver: numbers, pre-releases before releases, build metadata ignored", () => {
  assert.equal(VersionChange.of("1.0.0", undefined), "new")
  assert.equal(VersionChange.of("1.0.0", "1.0.0"), "same")
  // each version string is its own stored version
  assert.equal(VersionChange.of("1.0.0", "1.0.0+build.7"), "rebuild")
  assert.equal(VersionChange.of("1.10.0", "1.9.3"), "update")
  assert.equal(VersionChange.of("1.0.0-beta.2", "1.0.0"), "older")
  const sorted = ["1.0.0", "1.0.0-rc.1", "1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-beta.11", "1.0.0-beta.2", "0.9.0"].sort(VersionChange.compare)
  assert.deepEqual(sorted, ["0.9.0", "1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0"])
})
