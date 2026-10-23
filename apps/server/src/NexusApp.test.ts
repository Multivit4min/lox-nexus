import assert from "node:assert/strict"
import { test } from "node:test"
import { NexusApp } from "./NexusApp.ts"

test("starts and disposes", async () => {
  const app = new NexusApp()
  await app.start()
  await app.dispose()
  assert.equal(app.isDisposed, true)
})
