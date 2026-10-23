import assert from "node:assert/strict"
import { test } from "node:test"
import { EventBus, SignalRegistry } from "@lox-nexus/core"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { Database } from "../db/Database.ts"
import { MIGRATIONS } from "../db/migrations.ts"
import { Migrator } from "../db/Migrator.ts"
import { SnapshotRepository } from "../db/repositories/SnapshotRepository.ts"
import { LoggerFactory } from "../logging/LoggerFactory.ts"
import { SnapshotWriter } from "./SnapshotWriter.ts"

const setup = () => {
  const db = new Database(":memory:")
  new Migrator(db, MIGRATIONS).migrate()
  const signals = new SignalRegistry()
  signals.register({ id: "a", topic: "a/x", label: "", direction: "source", valueType: "number", delivery: "state" })
  const bus = new EventBus({ topicKinds: signals })
  const repo = new SnapshotRepository(db)
  return { db, bus, repo, writer: new SnapshotWriter(bus, signals, repo, LoggerFactory.silent()) }
}
const source = { source: { kind: "system" as const, id: "t" } }

test("only signal topics are stored; everything else is confirmed and forgotten", async () => {
  const { bus, repo, writer } = setup()
  bus.publish("a/x", Value.number(1), source)
  bus.publish("system/loxone/haus/status", Value.string("online"), source)
  assert.equal(writer.flush(), 1)
  assert.deepEqual(repo.load().map(e => e.topic), ["a/x"])
  assert.deepEqual(bus.pendingSnapshot(), [])
  await writer.dispose()
})

test("a failed write keeps the values pending and retries them", async () => {
  const { db, bus, repo, writer } = setup()
  bus.publish("a/x", Value.number(1), source)
  db.exec("ALTER TABLE value_snapshot RENAME TO broken")
  assert.equal(writer.flush(), 0)
  assert.equal(bus.pendingSnapshot().length, 1)
  db.exec("ALTER TABLE broken RENAME TO value_snapshot")
  assert.equal(writer.flush(), 1)
  assert.deepEqual(repo.load().map(e => e.value), [Value.number(1)])
  await writer.dispose()
})

test("disposing flushes the last changes", async () => {
  const { bus, repo, writer } = setup()
  bus.publish("a/x", Value.number(7), source)
  await writer.dispose()
  assert.deepEqual(repo.load().map(e => e.value), [Value.number(7)])
})
