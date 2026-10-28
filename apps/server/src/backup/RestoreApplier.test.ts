import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { TestApp } from "../test-support/TestApp.ts"
import { RestoreApplier } from "./RestoreApplier.ts"

test("a restore cut off halfway is finished by the next start, without losing either side", () => {
  const dir = TestApp.tempDir()
  const files = path.join(dir, "restore-pending", "files")
  fs.mkdirSync(path.join(files, "plugins", "p"), { recursive: true })
  fs.writeFileSync(path.join(files, "plugins", "p", "a.js"), "restored plugin")
  // the first run moved nexus.db already, then failed: the restored database is in place
  const before = path.join(dir, "before-restore-first")
  fs.mkdirSync(before)
  fs.writeFileSync(path.join(before, "nexus.db"), "current db")
  fs.writeFileSync(path.join(dir, "nexus.db"), "restored db")
  fs.mkdirSync(path.join(dir, "plugins", "q"), { recursive: true })
  fs.writeFileSync(path.join(dir, "plugins", "q", "b.js"), "current plugin")
  fs.writeFileSync(path.join(dir, "restore-pending", "apply.json"), JSON.stringify({ before }))
  assert.equal(RestoreApplier.apply(dir), before, "the same folder as the first run")
  assert.equal(fs.readFileSync(path.join(dir, "nexus.db"), "utf8"), "restored db")
  assert.equal(fs.readFileSync(path.join(before, "nexus.db"), "utf8"), "current db")
  assert.equal(fs.readFileSync(path.join(dir, "plugins", "p", "a.js"), "utf8"), "restored plugin")
  assert.equal(fs.readFileSync(path.join(before, "plugins", "q", "b.js"), "utf8"), "current plugin")
  assert.equal(fs.existsSync(path.join(dir, "restore-pending")), false)
  assert.equal(RestoreApplier.apply(dir), undefined)
  fs.rmSync(dir, { recursive: true })
})

test("a backup that was only checked is never applied", () => {
  const dir = TestApp.tempDir()
  fs.mkdirSync(path.join(dir, "restore-pending", "files"), { recursive: true })
  fs.writeFileSync(path.join(dir, "restore-pending", "files", "nexus.db"), "x")
  fs.writeFileSync(path.join(dir, "restore-pending", "checked.json"), "{}")
  assert.equal(RestoreApplier.apply(dir), undefined)
  fs.rmSync(dir, { recursive: true })
})
