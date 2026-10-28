import assert from "node:assert/strict"
import { test } from "node:test"
import Fastify from "fastify"
import { ChangeLock } from "./ChangeLock.ts"
import { ErrorHandler } from "./ErrorHandler.ts"

test("while held, changing requests get 503 with Retry-After; reads go on; a second hold is a 409", async t => {
  const lock = new ChangeLock()
  const app = Fastify()
  t.after(() => app.close())
  app.setErrorHandler(new ErrorHandler().handle)
  app.addHook("onRequest", lock.check)
  app.get("/thing", () => ({ ok: true }))
  app.post("/thing", () => ({ ok: true }))

  let release!: () => void
  const held = lock.hold("a config import", () => new Promise<void>(resolve => (release = resolve)))
  assert.equal(lock.heldBy, "a config import")
  const refused = await app.inject({ method: "POST", url: "/thing" })
  assert.equal(refused.statusCode, 503)
  assert.equal(refused.headers["retry-after"], "5")
  assert.match(refused.json<{ error: string }>().error, /a config import is running/)
  assert.equal((await app.inject({ method: "GET", url: "/thing" })).statusCode, 200)
  await assert.rejects(lock.hold("another", async () => {}), (error: Error & { status?: number }) => error.status === 409)

  release()
  await held
  assert.equal(lock.heldBy, undefined)
  assert.equal((await app.inject({ method: "POST", url: "/thing" })).statusCode, 200)
})
