import assert from "node:assert/strict"
import { test } from "node:test"
import type { DiagnosticsDto } from "@lox-nexus/api"
import { TestApp } from "../../test-support/TestApp.ts"

const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve))
}

test("diagnostics need a login, start without samples and download as CSV", { timeout: 10_000 }, async t => {
  const app = await TestApp.start()
  t.after(() => app.dispose())
  assert.equal((await app.client().get("/api/diagnostics")).statusCode, 401)
  assert.equal((await app.client().get("/api/diagnostics/samples.csv")).statusCode, 401)
  const admin = await app.admin()
  await settle()
  const diagnostics = (await admin.get("/api/diagnostics")).json<DiagnosticsDto>()
  assert.equal(diagnostics.samples.length, 0, "the first sample comes one interval in, not from the startup itself")
  assert.ok(diagnostics.startedAt > 0 && diagnostics.startedAt <= Date.now())
  assert.match(diagnostics.node, /^v\d+/)
  const csv = await admin.get("/api/diagnostics/samples.csv")
  assert.equal(csv.statusCode, 200)
  assert.match(String(csv.headers["content-type"]), /^text\/csv/)
  assert.match(String(csv.headers["content-disposition"]), /^attachment; filename="nexus-diagnostics-.*\.csv"$/)
  assert.equal(csv.body.trim().split("\r\n").length, 1, "the header")
  assert.equal((await admin.get("/api/diagnostics?since=x")).statusCode, 400)
})
