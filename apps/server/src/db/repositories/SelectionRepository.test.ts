import assert from "node:assert/strict"
import { test } from "node:test"
import { Persistence } from "../Persistence.ts"

test("one rule per target and consumer; rules go with their target", () => {
  const db = new Persistence(":memory:", () => {})
  db.db.run("INSERT INTO miniservers (id, slug, label, host, port, listen_port, own_id, remote_id, enabled, resend_interval) VALUES ('ms', 'haus', '', 'h', 1, 2, 'a', 'b', 0, 0)")
  db.db.run("INSERT INTO signals (id, owner) VALUES ('s1', 'ms')")
  const { selections } = db
  assert.equal(selections.mode("history"), undefined)
  selections.setMode("history", "all")
  selections.setRule("history", { signalId: "s1" }, true)
  selections.setRule("history", { signalId: "s1" }, false)
  selections.setRule("history", { miniserverId: "ms" }, false)
  selections.setRule("other", { signalId: "s1" }, true)
  assert.deepEqual(selections.rules("history"), [{ target: { signalId: "s1" }, include: false }, { target: { miniserverId: "ms" }, include: false }])
  assert.throws(() => selections.setRule("history", { signalId: "nope" }, true), /FOREIGN KEY/)
  db.db.run("DELETE FROM signals WHERE id = 's1'")
  assert.deepEqual(selections.rules("history"), [{ target: { miniserverId: "ms" }, include: false }])
  selections.setRule("history", { miniserverId: "ms" }, null)
  assert.deepEqual(selections.rules("history"), [])
  selections.forget("history")
  assert.equal(selections.mode("history"), undefined)
  db.close()
})
