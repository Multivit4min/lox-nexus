import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import type { MiniserverDto } from "@lox-nexus/api"
import { IciSocket } from "@lox-nexus/ici"
import type { ApiClient } from "../../test-support/ApiClient.ts"
import { TestApp } from "../../test-support/TestApp.ts"

let app: TestApp
let admin: ApiClient
before(async () => {
  app = await TestApp.start()
  admin = await app.admin()
})
after(() => app.dispose())

test("Miniservers can share a listen port when their ids differ", async () => {
  const probe = new IciSocket()
  await probe.bind(0, "127.0.0.1")
  const listenPort = probe.address()!.port
  await probe.close()
  const body = (slug: string, remoteId: string) => ({
    slug, label: slug, host: "127.0.0.1", port: 7777, listenPort, listenAddress: "127.0.0.1", ownId: "nexus", remoteId
  })
  const first = await admin.post("/api/miniservers", body("haus", "ms1"))
  const second = await admin.post("/api/miniservers", body("garage", "ms2"))
  assert.deepEqual([first.statusCode, second.statusCode], [201, 201], second.body)
  assert.deepEqual([first.json<MiniserverDto>().running, second.json<MiniserverDto>().running], [true, true])
  const twin = await admin.post("/api/miniservers", body("keller", "ms1"))
  assert.equal(twin.statusCode, 409)
  assert.match(twin.json<{ error: string }>().error, /same ids/)
})
