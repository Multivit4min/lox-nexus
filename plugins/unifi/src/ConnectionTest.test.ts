import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { FakeConsole } from "./test-support/FakeConsole.ts"
import { UnifiPlugin } from "./UnifiPlugin.ts"

let realConsole: FakeConsole
let impostor: FakeConsole
before(async () => {
  realConsole = await FakeConsole.start()
  impostor = await FakeConsole.start()
})
after(async () => {
  await realConsole.close()
  await impostor.close()
})

test("Test connection names the version and the site, reaching the console over the pinned certificate", async () => {
  const answer = await PluginTestHost.testConfig(UnifiPlugin, realConsole.config())
  assert.equal(answer, `Connected to UniFi Network 10.3.58 at https://${realConsole.host}, site "Default"`)
  const asked = realConsole.requests.map(request => `${request.method} ${request.path}`)
  assert.ok(asked.includes("GET /v1/info") && asked.includes("GET /v1/sites"))
  assert.ok(realConsole.requests.every(request => request.method === "GET"), "the test only reads")
})

test("a site is found by name, ignoring case, and an unknown one names the sites there are", async () => {
  assert.match(await PluginTestHost.testConfig(UnifiPlugin, realConsole.config({ site: "holiday flat" })) ?? "", /site "Holiday Flat"/)
  await assert.rejects(PluginTestHost.testConfig(UnifiPlugin, realConsole.config({ site: "Office" })), /no site "Office" on the console; it has "Default", "Holiday Flat"/)
})

test("a certificate that isn't the pinned one is refused before the API key is sent", async () => {
  const before = impostor.requests.length
  const config = { ...impostor.config(), fingerprint: realConsole.certificate.fingerprint }
  await assert.rejects(PluginTestHost.testConfig(UnifiPlugin, config), new RegExp(`doesn't match the pinned fingerprint; it presented SHA-256 ${impostor.certificate.fingerprint}`))
  assert.equal(impostor.requests.length, before, "no request reached the other server")
})

test("without a pin a self-signed certificate is refused, naming its fingerprint to check and pin", async () => {
  const config = { host: realConsole.host, apiKey: FakeConsole.KEY }
  const before = realConsole.requests.length
  await assert.rejects(PluginTestHost.testConfig(UnifiPlugin, config), new RegExp(`isn't trusted .*SHA-256 ${realConsole.certificate.fingerprint}`))
  assert.equal(realConsole.requests.length, before)
})

test("accept any certificate reaches it, and a pinned fingerprint wins over that switch", async () => {
  assert.match(await PluginTestHost.testConfig(UnifiPlugin, { host: realConsole.host, apiKey: FakeConsole.KEY, acceptAnyCertificate: true }) ?? "", /Connected/)
  const pinnedElsewhere = { ...impostor.config(), fingerprint: realConsole.certificate.fingerprint, acceptAnyCertificate: true }
  await assert.rejects(PluginTestHost.testConfig(UnifiPlugin, pinnedElsewhere), /doesn't match the pinned fingerprint/)
})

test("fingerprints may be typed with or without colons, in any case", async () => {
  const bare = realConsole.certificate.fingerprint.replace(/:/g, "").toLowerCase()
  assert.match(await PluginTestHost.testConfig(UnifiPlugin, realConsole.config({ fingerprint: bare })) ?? "", /Connected/)
})

// a wrong key only against the fake realConsole
test("a refused API key fails Test connection and the start, which a restart can't fix", async () => {
  await assert.rejects(PluginTestHost.testConfig(UnifiPlugin, realConsole.config({ apiKey: "wrong" })), /refused the API key \(HTTP 401: Missing credentials\); create a key/)
  await assert.rejects(PluginTestHost.start(UnifiPlugin, { config: realConsole.config({ apiKey: "wrong" }) }), /refused the API key/)
})

test("the config accepts a host, an https URL with its own base path, and refuses http", async () => {
  const check = (host: string) => PluginTestHost.checkConfig(UnifiPlugin, { host, apiKey: "k" })
  assert.deepEqual((await check("192.0.2.1")).issues, [])
  assert.deepEqual((await check("https://unifi.example:8443/integration")).issues, [])
  assert.deepEqual((await check("http://192.0.2.1")).issues.map(issue => issue.path), [["host"]])
  const description = await PluginTestHost.describe(UnifiPlugin)
  assert.equal((description.config as { properties: Record<string, { writeOnly?: boolean }> }).properties.apiKey?.writeOnly, true)
})
