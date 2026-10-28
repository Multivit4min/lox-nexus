import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { IcsServer } from "../test-support/IcsServer.ts"
import { FeedClient } from "./FeedClient.ts"

let server: IcsServer
before(async () => {
  server = await IcsServer.start()
})
after(() => server.close())

test("an unchanged feed answers 304 and the client says so; a change or forget() fetches it again", async () => {
  server.serve("/cal.ics", "weekly.ics").etag("/cal.ics", "\"v1\"")
  const client = new FeedClient({ url: server.url("/cal.ics"), timeoutMs: 5000 })
  const first = await client.fetch()
  assert.match(first ?? "", /BEGIN:VCALENDAR/)
  assert.equal(await client.fetch(), undefined)
  assert.deepEqual(server.requests.slice(-2).map(request => request.ifNoneMatch), [undefined, "\"v1\""])

  server.text("/cal.ics", IcsServer.fixture("weekly.ics").replace("Weekly", "Changed"), "text/calendar").etag("/cal.ics", "\"v2\"")
  assert.match(await client.fetch() ?? "", /BEGIN:VCALENDAR/)
  client.forget()
  assert.match(await client.fetch() ?? "", /BEGIN:VCALENDAR/)
  assert.equal(server.requests.at(-1)?.ifNoneMatch, undefined)
})

test("a server without validators is asked for the whole feed every time", async () => {
  server.serve("/plain.ics", "weekly.ics")
  const client = new FeedClient({ url: server.url("/plain.ics"), timeoutMs: 5000 })
  assert.ok(await client.fetch())
  assert.ok(await client.fetch())
  assert.deepEqual(server.requests.filter(request => request.path === "/plain.ics").map(request => request.ifNoneMatch), [undefined, undefined])
})
