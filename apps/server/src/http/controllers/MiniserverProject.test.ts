import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import type { LoxoneProjectDto, MiniserverDto } from "@lox-nexus/api"
import { ProjectReadError, type ReadProject } from "@lox-nexus/loxone"
import type { ApiClient } from "../../test-support/ApiClient.ts"
import { TestApp } from "../../test-support/TestApp.ts"

const project: ReadProject = {
  file: "sps_0274_20261024142743.zip",
  project: {
    title: "Test house", savedAt: "2026-10-24 14:27:35",
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
        }
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
})
