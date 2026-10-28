import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, test } from "node:test"
import { TestApp } from "../test-support/TestApp.ts"
import { DatabaseLock } from "./DatabaseLock.ts"

let dir: string
let database: string
beforeEach(() => {
  dir = TestApp.tempDir()
  database = path.join(dir, "nexus.db")
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const lockedBy = (pid: number | string) => fs.writeFileSync(`${database}.lock`, String(pid))

test("a lock held by a running process refuses; release removes only our own lock", () => {
  const lock = DatabaseLock.acquire(database)
  assert.equal(fs.readFileSync(`${database}.lock`, "utf8"), String(process.pid))
  lock.release()
  assert.equal(fs.existsSync(`${database}.lock`), false)

  // the test runner's parent is alive and isn't us
  lockedBy(process.ppid)
  assert.throws(() => DatabaseLock.acquire(database), new RegExp(`another Nexus \\(process ${process.ppid}\\)`))
  lock.release()
  assert.equal(fs.readFileSync(`${database}.lock`, "utf8"), String(process.ppid), "someone else's lock stays")
})

test("a lock of a process that is gone, of this very pid (a container restart) or unreadable is taken over", () => {
  for (const owner of [2_147_483_000, process.pid, "garbage"]) {
    lockedBy(owner)
    const lock = DatabaseLock.acquire(database)
    assert.equal(fs.readFileSync(`${database}.lock`, "utf8"), String(process.pid))
    lock.release()
  }
})

test("a second NexusApp on the same database file doesn't start", async () => {
  const first = new TestApp({ databaseFile: database })
  try {
    lockedBy(process.ppid)
    assert.throws(() => new TestApp({ databaseFile: path.join(dir, "nexus.db") }), /another Nexus/)
  } finally {
    fs.writeFileSync(`${database}.lock`, String(process.pid))
    await first.dispose()
  }
  assert.equal(fs.existsSync(`${database}.lock`), false, "disposing releases the lock")
})
