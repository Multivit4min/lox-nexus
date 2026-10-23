import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { TestApp } from "../test-support/TestApp.ts"
import { Database } from "./Database.ts"
import { MIGRATIONS } from "./migrations.ts"
import { Migrator } from "./Migrator.ts"
import { ForceRepository } from "./repositories/ForceRepository.ts"
import { LoadSampleRepository } from "./repositories/LoadSampleRepository.ts"
import { WireRepository } from "./repositories/WireRepository.ts"

test("a throwing transaction rolls back everything, nested calls included", () => {
  const db = new Database(":memory:")
  db.exec("CREATE TABLE t (n INTEGER)")
  assert.throws(() => db.transaction(() => {
    db.run("INSERT INTO t VALUES (1)")
    db.transaction(() => db.run("INSERT INTO t VALUES (2)"))
    throw new Error("boom")
  }), /boom/)
  assert.deepEqual(db.all("SELECT * FROM t"), [])
})

test("migrations run once; the file is private to the user", () => {
  const file = path.join(TestApp.tempDir(), "sub", "nexus.db")
  const db = new Database(file)
  assert.deepEqual(new Migrator(db, MIGRATIONS).migrate(), ["1_initial", "2_load_samples"])
  assert.deepEqual(new Migrator(db, MIGRATIONS).migrate(), [])
  db.close()
  assert.equal(fs.statSync(file).mode & 0o777, 0o600)
  assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700)
})

test("forces round-trip; unreadable rows are skipped with a warning", () => {
  const db = new Database(":memory:")
  new Migrator(db, MIGRATIONS).migrate()
  const warnings: string[] = []
  const forces = new ForceRepository(db, message => warnings.push(message))
  forces.save({ topic: "a/x", value: Value.rgbw({ red: 1, green: 2, blue: 3, white: 4, fadeTime: 1.5, flags: 0x4000 }), by: "admin", at: 5, kind: "state", until: 9 })
  db.run("INSERT INTO forces (topic, value, forced_by, at, kind) VALUES ('a/y', '{\"type\":\"bogus\"}', 'x', 1, 'state')")
  assert.deepEqual(forces.load(), [{ topic: "a/x", value: Value.rgbw({ red: 1, green: 2, blue: 3, white: 4, fadeTime: 1.5, flags: 0x4000 }), by: "admin", at: 5, kind: "state", until: 9 }])
  assert.deepEqual(warnings, ["ignoring force on a/y: stored value is invalid"])
})

test("a wire with corrupt transforms is still listed, and WireEngine will refuse it", () => {
  const db = new Database(":memory:")
  new Migrator(db, MIGRATIONS).migrate()
  db.exec("INSERT INTO signals VALUES ('s', 'x'), ('t', 'x')")
  db.exec("INSERT INTO wires VALUES ('w', 'w', 's', 't', 'not json', 1, 0)")
  assert.deepEqual(new WireRepository(db).list()[0]?.transforms, [{ op: "invalid" }])
})

test("load samples: an hour per Miniserver, pruned on write, deleted with the Miniserver", () => {
  const db = new Database(":memory:")
  new Migrator(db, MIGRATIONS).migrate()
  db.exec("INSERT INTO miniservers VALUES ('ms', 'haus', '', 'h', 1, 2, NULL, 'a', 'b', NULL, 1, 10000)")
  const warnings: string[] = []
  const repo = new LoadSampleRepository(db, message => warnings.push(message))
  const sample = (ts: number) => ({ ts, incomingPerSecond: 1.5, outgoingPerSecond: 0.5, percent: 5.7 })
  repo.append("ms", sample(1000), 0)
  repo.append("ms", sample(2000), 0)
  repo.append("ms", sample(3000), 1500)
  assert.deepEqual(repo.load("ms", 0), [sample(2000), sample(3000)])
  assert.deepEqual(repo.load("ms", 2500), [sample(3000)])
  repo.append("gone", sample(4000), 0)
  assert.match(warnings[0] ?? "", /storing a load sample of gone failed/, "a write for an unknown Miniserver is logged, not thrown")
  db.exec("DELETE FROM miniservers WHERE id = 'ms'")
  assert.deepEqual(db.all("SELECT * FROM load_samples"), [])
})
