import assert from "node:assert/strict"
import { test } from "node:test"
import { McpAudit } from "./McpAudit.ts"
import type { ToolContext } from "./ToolContext.ts"

const context: ToolContext = { user: { id: "u1", username: "admin" }, access: { tokenId: "t1", name: "agent", scopes: ["read", "configure"] }, by: "admin via MCP (agent)", signal: new AbortController().signal }

test("the audit never fails the call whose change already happened", () => {
  const warned: unknown[] = []
  const log = { info: () => {}, warn: (entry: unknown) => void warned.push(entry) }
  const full = new McpAudit(log, { insert: () => { throw new Error("disk full") } })
  assert.doesNotThrow(() => full.changed(context, "force", { signal: "x" }, "ok"))
  const broken = new McpAudit(log, undefined, () => { throw new Error("a broken plugin description") })
  assert.doesNotThrow(() => broken.changed(context, "force", { signal: "x" }, "ok"))
  assert.equal(warned.length, 2)
})

test("rows carry the user, the token's name, the masked input and the clock's time", () => {
  const rows: unknown[] = []
  const audit = new McpAudit({ info: () => {}, warn: () => {} }, { insert: row => void rows.push(row) }, () => new Set(["password"]), () => 42)
  audit.changed(context, "create_miniserver", { slug: "haus", password: "planted" }, "refused", "no")
  assert.deepEqual(rows, [{ at: 42, user_id: "u1", token_id: "t1", token_name: "agent", tool: "create_miniserver", input: "{\"slug\":\"haus\",\"password\":\"‹secret›\"}", outcome: "refused", detail: "no" }])
})
