import assert from "node:assert/strict"
import { test } from "node:test"
import Fastify from "fastify"
import { ChangeLock } from "./ChangeLock.ts"
import { ErrorHandler } from "./ErrorHandler.ts"

async function setup() {
  const lock = new ChangeLock()
  const app = Fastify()
  app.setErrorHandler(new ErrorHandler().handle)
  app.addHook("onRequest", lock.check)
  let release!: () => void
  const gate = new Promise<void>(resolve => (release = resolve))
  app.get("/thing", () => ({ ok: true }))
  app.post("/thing", () => ({ ok: true }))
  app.post("/login", { config: { lockFree: true } }, () => ({ ok: true }))
  app.post("/slow", async () => {
    await gate
    return { ok: true }
  })
  await app.ready()
  return { lock, app, release }
}

test("while held, changing requests get 503 with Retry-After; reads and lock-free routes go on; a second hold is a 409", async t => {
  const { lock, app } = await setup()
  t.after(() => app.close())
  let release!: () => void
  const held = lock.hold("a config import", () => new Promise<void>(resolve => (release = resolve)))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(lock.heldBy, "a config import")
  const refused = await app.inject({ method: "POST", url: "/thing" })
  assert.equal(refused.statusCode, 503)
  assert.equal(refused.headers["retry-after"], "5")
  assert.match(refused.json<{ error: string }>().error, /a config import is running/)
  assert.equal((await app.inject({ method: "GET", url: "/thing" })).statusCode, 200)
  assert.equal((await app.inject({ method: "POST", url: "/login" })).statusCode, 200, "a lock-free route")
  await assert.rejects(lock.hold("another", async () => {}), (error: Error & { status?: number }) => error.status === 409)
  release()
  await held
  assert.equal(lock.heldBy, undefined)
  assert.equal((await app.inject({ method: "POST", url: "/thing" })).statusCode, 200)
})

test("hold() waits for changing requests already in flight, and refuses new ones meanwhile", async t => {
  const { lock, app, release } = await setup()
  t.after(() => app.close())
  const slow = app.inject({ method: "POST", url: "/slow" })
  // a few event-loop turns get the request past its hooks into the handler
  for (let turn = 0; turn < 10; turn++) await new Promise(resolve => setImmediate(resolve))
  const steps: string[] = []
  const held = lock.hold("a config import", async () => void steps.push("work"))
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(steps, [], "not while /slow runs")
  assert.equal((await app.inject({ method: "POST", url: "/thing" })).statusCode, 503)
  release()
  assert.equal((await slow).statusCode, 200)
  await held
  assert.deepEqual(steps, ["work"])
})
