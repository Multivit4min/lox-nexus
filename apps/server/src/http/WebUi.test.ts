import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { TestApp } from "../test-support/TestApp.ts"

test("a UI built after boot is served, including chunks that did not exist at boot", async t => {
  const webDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-web-"))
  const app = await TestApp.start({}, { NEXUS_WEB_DIR: webDir })
  t.after(async () => {
    await app.dispose()
    fs.rmSync(webDir, { recursive: true, force: true })
  })
  const http = app.app.server!.app

  const before = await http.inject({ method: "GET", url: "/" })
  assert.equal(before.statusCode, 503)

  fs.mkdirSync(path.join(webDir, "assets"))
  fs.writeFileSync(path.join(webDir, "index.html"), "<!doctype html><title>ui</title>")
  fs.writeFileSync(path.join(webDir, "assets", "Late-abc123.js"), "export {}")

  const chunk = await http.inject({ method: "GET", url: "/assets/Late-abc123.js" })
  assert.equal(chunk.statusCode, 200)
  assert.equal(chunk.body, "export {}")
  const route = await http.inject({ method: "GET", url: "/miniservers/1" })
  assert.equal(route.statusCode, 200)
  assert.match(route.body, /<title>ui<\/title>/)
  const api = await http.inject({ method: "GET", url: "/api/nope" })
  assert.equal(api.statusCode, 404)
})
