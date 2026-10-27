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

test("the docs site is served at /docs/ without a login, with its own 404 page, next to the web UI", async t => {
  const docsDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-docs-"))
  const webDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-web-"))
  fs.writeFileSync(path.join(webDir, "index.html"), "<!doctype html><title>ui</title>")
  const app = await TestApp.start({}, { NEXUS_DOCS_DIR: docsDir, NEXUS_WEB_DIR: webDir })
  t.after(async () => {
    await app.dispose()
    for (const dir of [docsDir, webDir]) fs.rmSync(dir, { recursive: true, force: true })
  })
  const http = app.app.server!.app
  const get = (url: string) => http.inject({ method: "GET", url })
  assert.equal((await get("/docs/nope.html")).statusCode, 503, "not built yet, and not the web UI's index")
  fs.mkdirSync(path.join(docsDir, "guide"))
  fs.writeFileSync(path.join(docsDir, "index.html"), "<!doctype html><title>docs</title>")
  fs.writeFileSync(path.join(docsDir, "guide", "start.html"), "<p>start</p>")
  fs.writeFileSync(path.join(docsDir, "guide", "index.html"), "<p>guide index</p>")
  fs.writeFileSync(path.join(docsDir, ".hidden"), "secret")
  fs.writeFileSync(path.join(docsDir, "404.html"), "<html><head><title>404</title></head></html>")

  const redirect = await get("/docs")
  assert.deepEqual([redirect.statusCode, redirect.headers.location], [301, "docs/"], "relative, for proxy prefixes")
  assert.match((await get("/docs/")).body, /<title>docs<\/title>/)
  assert.equal((await get("/docs/guide/start.html")).body, "<p>start</p>")
  const missing = await get("/docs/guide/deep/missing.html")
  assert.equal(missing.statusCode, 404)
  assert.match(missing.body, /<head><base href="\.\.\/\.\.\/">/, "the 404 page's relative links work at any depth")
  for (const url of ["/docs/guide", "/docs/guide/", "/docs/.hidden"]) {
    assert.match((await get(url)).body, /<title>404<\/title>/, `${url}: directories (their base would be off) and dotfiles aren't served`)
  }
  assert.equal((await get("/docs/../package.json")).statusCode, 200, "normalised to /package.json: the web UI's fallback, not a file")
  assert.match((await get("/docs/../package.json")).body, /<title>ui<\/title>/)
  assert.equal((await get("/api/miniservers")).statusCode, 401, "the API still needs a login")
})

test("without NEXUS_DOCS_DIR, /docs says how to enable it instead of serving the web UI", async t => {
  const webDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-web-"))
  fs.writeFileSync(path.join(webDir, "index.html"), "<!doctype html><title>ui</title>")
  const app = await TestApp.start({}, { NEXUS_WEB_DIR: webDir })
  t.after(async () => {
    await app.dispose()
    fs.rmSync(webDir, { recursive: true, force: true })
  })
  for (const url of ["/docs/", "/docs/assets/style.css"]) {
    const response = await app.app.server!.app.inject({ method: "GET", url })
    assert.equal(response.statusCode, 404)
    assert.match(response.body, /NEXUS_DOCS_DIR/)
  }
})
