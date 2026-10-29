import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import type { LoxoneProjectDto, MiniserverDto } from "@lox-nexus/api"
import { ProjectReadError, ProjectReader, type ReadProject } from "@lox-nexus/loxone"
import type { ApiClient } from "../../test-support/ApiClient.ts"
import { TimeZoneSetting } from "../../services/TimeZoneSetting.ts"
import { TestApp } from "../../test-support/TestApp.ts"

const project: ReadProject = {
  file: "sps_0274_20261024142743.zip",
  project: {
    title: "Test house", savedAt: "2026-10-24 14:27:35", timeZone: "Europe/Vienna",
    peers: [{
      miniserverId: "ms", miniserverPort: 61263, label: "nexus-dev", id: "nexus", host: "10.0.0.5", port: 61263, encrypted: false,
      signals: [{ packetId: "pv", direction: "out", dataType: 1, label: "PV power" }]
    }]
  }
}

describe("reading a Miniserver's project over the API", { timeout: 10_000 }, () => {
  let app: TestApp
  let admin: ApiClient
  let url: string
  const calls: Array<{ host: string; username: string; password: string }> = []
  let failure: Error | undefined

  before(async () => {
    app = await TestApp.start({
      projectReader: {
        read: (host, login) => {
          calls.push({ host, ...login })
          return failure ? Promise.reject(failure) : Promise.resolve(project)
        },
        // uploaded files are parsed for real; nothing is downloaded for them
        file: (name, data) => new ProjectReader({ download: () => Promise.reject(new Error("no download")) }).file(name, data)
      }
    })
    admin = await app.admin()
    const ms = (await admin.post("/api/miniservers", {
      slug: "haus", label: "Haus", host: "192.0.2.7", port: 7777, listenPort: 7000, ownId: "nexus", remoteId: "ms", enabled: false
    })).json<MiniserverDto>()
    url = `/api/miniservers/${ms.id}/project`
  })
  after(() => app.dispose())

  test("reads from the Miniserver's host with the given login and answers the peers", async () => {
    const response = await admin.post(url, { username: "claude", password: "pw" })
    assert.equal(response.statusCode, 200, response.body)
    assert.deepEqual(response.json<LoxoneProjectDto>(), { file: project.file, ...project.project })
    assert.deepEqual(calls.at(-1), { host: "192.0.2.7", username: "claude", password: "pw" })
    assert.equal(new TimeZoneSetting(app.app.persistence.settings).get(), "Europe/Vienna", "kept for the plugins")
  })

  test("a read failure is a 502 with its message; anything else stays a 500 without details", async () => {
    failure = new ProjectReadError("the Miniserver refused the FTP login")
    const refused = await admin.post(url, { username: "claude", password: "wrong" })
    assert.deepEqual([refused.statusCode, refused.json<{ error: string }>().error], [502, "the Miniserver refused the FTP login"])
    failure = new Error("internal detail")
    const broken = await admin.post(url, { username: "claude", password: "pw" })
    assert.equal(broken.statusCode, 500)
    assert.doesNotMatch(broken.body, /internal detail/)
    failure = undefined
  })

  test("400 without a login, 404 for an unknown Miniserver, 401 without a session", async () => {
    assert.equal((await admin.post(url, { username: "claude" })).statusCode, 400)
    // FTP commands are lines: a line break would be refused by the FTP client as a 500
    const calls0 = calls.length
    assert.equal((await admin.post(url, { username: "claude\r\nDELE x", password: "pw" })).statusCode, 400)
    assert.equal(calls.length, calls0, "nothing reaches the Miniserver")
    assert.equal((await admin.post("/api/miniservers/nope/project", { username: "a", password: "b" })).statusCode, 404)
    assert.equal((await app.client().post(url, { username: "a", password: "b" })).statusCode, 401)
  })

  test("an uploaded project file is read the same way, whatever its name; anything else is a 400", async () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<ControlList><C Type="Document" Title="Uploaded house"><C Type="LanInt" Pt="61263" MId="ms">
  <C Type="HItcDev" Title="nexus-dev" sid="nexus" dP="61264" dAd="10.0.0.5"><C Type="HItcIn" Title="PV" tp="1" pid="pv"/></C>
</C></C></ControlList>`
    const upload = (body: Buffer, name = "Haus.Loxone") => admin.post(`${url}/file?name=${encodeURIComponent(name)}`, body, { "content-type": "application/octet-stream" })
    const read = await upload(Buffer.from(xml))
    assert.equal(read.statusCode, 200, read.body)
    const dto = read.json<LoxoneProjectDto>()
    assert.deepEqual([dto.file, dto.title, dto.peers[0]?.signals.map(signal => signal.packetId)], ["Haus.Loxone", "Uploaded house", ["pv"]])
    const refused = await upload(Buffer.from("a spreadsheet"), "notes.txt")
    assert.deepEqual([refused.statusCode, refused.json<{ error: string }>().error], [400, "\"notes.txt\" is not a Loxone Config project (.Loxone), a Miniserver archive (sps_….zip) or a .LoxCC file"])
    assert.equal((await admin.post(`${url}/file`, { not: "a file" })).statusCode, 415, "JSON is refused before it is read")
    assert.equal((await admin.post("/api/miniservers/nope/project/file", Buffer.from(xml), { "content-type": "application/octet-stream" })).statusCode, 404)
  })

  test("the upload needs a session, is capped at 32 MB, and only that route takes raw bytes", async () => {
    const octets = { "content-type": "application/octet-stream" }
    assert.equal((await app.client().post(`${url}/file`, Buffer.from("<x/>"), octets)).statusCode, 401)
    assert.equal((await admin.post(`${url}/file`, Buffer.alloc(32 * 1_048_576 + 1), octets)).statusCode, 413)
    assert.equal((await admin.post("/api/miniservers", Buffer.from("{}"), octets)).statusCode, 415)
    assert.equal((await admin.post(`${url}/file?name=${encodeURIComponent("a\nb")}`, Buffer.from("<x/>"), octets)).statusCode, 400)
  })
})
