import assert from "node:assert/strict"
import { mock, test } from "node:test"
import type { StagedPackage } from "./PackageInspector.ts"
import { PendingInstalls } from "./PendingInstalls.ts"

const staged = {} as StagedPackage

test("a staged install expires, and a new one replaces it; both remove the files", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] })
  const remove = mock.fn(async (dir: string) => void dir)
  const pending = new PendingInstalls({ remove }, 1000)
  t.after(() => pending.dispose())

  const first = await pending.put("/staging/a", staged, "admin")
  assert.equal(first.expiresAt, 1000)
  const second = await pending.put("/staging/b", staged, "admin")
  assert.equal(pending.get(first.stagingId), undefined)
  assert.deepEqual(remove.mock.calls.map(call => call.arguments[0]), ["/staging/a"])

  t.mock.timers.tick(999)
  assert.equal(pending.get(second.stagingId), second)
  t.mock.timers.tick(1)
  await Promise.resolve()
  assert.equal(pending.get(second.stagingId), undefined)
  assert.deepEqual(remove.mock.calls.map(call => call.arguments[0]), ["/staging/a", "/staging/b"])
})

test("taking hands the files over: no expiry removes them afterwards", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] })
  const remove = mock.fn(async (dir: string) => void dir)
  const pending = new PendingInstalls({ remove }, 1000)
  t.after(() => pending.dispose())
  const install = await pending.put("/staging/a", staged, "admin")
  assert.equal(pending.take(install.stagingId), install)
  assert.equal(pending.take(install.stagingId), undefined)
  t.mock.timers.tick(5000)
  assert.equal(remove.mock.callCount(), 0)
  assert.equal(await pending.discard(install.stagingId), false)
})
