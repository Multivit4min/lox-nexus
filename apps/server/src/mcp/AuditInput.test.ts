import assert from "node:assert/strict"
import { test } from "node:test"
import { AuditInput } from "./AuditInput.ts"

test("fields named like a secret are masked wherever they sit; long inputs are cut", () => {
  const names = AuditInput.secretFields([
    { type: "object", properties: { url: { type: "string" }, token: { type: "string", writeOnly: true } } },
    [{ id: "reading", params: { type: "object", properties: { apiKey: { type: "string", writeOnly: true } } } }]
  ])
  assert.deepEqual([...names].sort(), ["apiKey", "password", "token"])
  const audit = new AuditInput(() => names)
  assert.equal(
    audit.text({ plugin: "ha", config: { url: "http://ha", token: "planted" }, items: [{ entry: { params: { apiKey: "planted" } } }] }),
    JSON.stringify({ plugin: "ha", config: { url: "http://ha", token: "‹secret›" }, items: [{ entry: { params: { apiKey: "‹secret›" } } }] })
  )
  assert.ok(audit.text({ text: "x".repeat(5000) }).endsWith("…"))
  assert.equal(audit.text({ text: "x".repeat(5000) }).length, AuditInput.MAX + 1)
})
