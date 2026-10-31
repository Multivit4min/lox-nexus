import assert from "node:assert/strict"
import { test } from "node:test"
import { Persistence } from "../Persistence.ts"
import { McpAuditRepository, type McpAuditRow } from "./McpAuditRepository.ts"

const DAY = 86_400_000

function setup() {
  const db = new Persistence(":memory:", () => {})
  db.users.insert({ id: "u1", username: "admin", password_hash: "x", created_at: 0 })
  db.users.insert({ id: "u2", username: "other", password_hash: "x", created_at: 0 })
  db.accessTokens.insertIfPassword({ id: "t1", user_id: "u1", name: "agent", scopes: "[]", token_sha256: "h", created_at: 0 }, "x")
  const row = (at: number, tool: string, user = "u1"): McpAuditRow => ({ at, user_id: user, token_id: "t1", token_name: "agent", tool, input: "{}", outcome: "ok", detail: null })
  return { db, row }
}

test("a user sees their own entries, newest first; a revoked token's keep its name", () => {
  const { db, row } = setup()
  db.mcpAudit.insert(row(1, "force"))
  db.mcpAudit.insert(row(2, "inject"))
  db.mcpAudit.insert({ ...row(3, "bridge", "u2"), token_id: "t1" })
  assert.deepEqual(db.mcpAudit.recentFor("u1", 10).map(entry => entry.tool), ["inject", "force"])
  db.accessTokens.delete("u1", "t1")
  assert.deepEqual(db.mcpAudit.recentFor("u1", 10).map(entry => [entry.token_id, entry.token_name]), [[null, "agent"], [null, "agent"]])
})

test("entries older than the limit or beyond the count are dropped as new ones come", () => {
  const { db, row } = setup()
  const audit = new McpAuditRepository(db.db, { rows: 3, ageMs: 90 * DAY })
  for (let i = 0; i < 5; i++) audit.insert(row(100 * DAY + i, `t${i}`))
  assert.deepEqual(audit.recentFor("u1", 10).map(entry => entry.tool), ["t4", "t3", "t2"])
  audit.insert(row(200 * DAY, "late"))
  assert.deepEqual(audit.recentFor("u1", 10).map(entry => entry.tool), ["late"], "90 days later the old ones are gone")
})

test("a deleted user's entries go with them", () => {
  const { db, row } = setup()
  db.mcpAudit.insert(row(1, "force"))
  db.users.delete("u1")
  assert.deepEqual(db.mcpAudit.recentFor("u1", 10), [])
})
