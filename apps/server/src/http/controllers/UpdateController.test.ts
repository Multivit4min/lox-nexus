import assert from "node:assert/strict"
import { test } from "node:test"
import type { AppUpdateDto } from "@lox-nexus/api"
import { TestApp } from "../../test-support/TestApp.ts"

// test servers run with NEXUS_UPDATE_CHECK=false, so nothing here reaches GitHub
test("the update check is behind the login, keeps its switch, and refuses Check now when the server forbids it", { timeout: 10_000 }, async t => {
  const app = await TestApp.start()
  t.after(() => app.dispose())
  assert.equal((await app.client().get("/api/system/update")).statusCode, 401)
  const admin = await app.admin()
  const dto = (await admin.get("/api/system/update")).json<AppUpdateDto>()
  assert.deepEqual([dto.enabled, dto.disabledByServer, dto.changes, dto.available], [true, true, [], undefined])
  assert.match(dto.current, /^\d+\.\d+\.\d+/)
  assert.equal((await admin.put("/api/system/update/settings", { enabled: false })).json<AppUpdateDto>().enabled, false)
  assert.equal((await admin.get("/api/system/update")).json<AppUpdateDto>().enabled, false, "kept")
  assert.equal((await admin.put("/api/system/update/settings", { enabled: "no" })).statusCode, 400)
  const refused = await admin.post("/api/system/update/check")
  assert.equal(refused.statusCode, 409)
  assert.match(refused.body, /NEXUS_UPDATE_CHECK=false/)
})
