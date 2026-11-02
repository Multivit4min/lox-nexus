import assert from "node:assert/strict"
import { test } from "node:test"
import type { AppUpdateDto } from "@lox-nexus/api"
import { AppUpdateStore } from "./AppUpdateStore.ts"

const dto = (extra: Partial<AppUpdateDto> = {}): AppUpdateDto => ({ current: "0.8.0", enabled: true, disabledByServer: false, changes: [], ...extra })

test("loads at the same time share a request; a failed load is kept for the page, and the next one tries again", async () => {
  let asked = 0
  let fail = true
  const store = new AppUpdateStore({
    get: async () => (asked++, fail ? Promise.reject(new Error("not logged in")) : dto({ available: { version: "0.9.0", url: "u", filesUrl: "f" } })),
    check: async () => dto(),
    setEnabled: async () => dto()
  })
  await Promise.all([store.load(), store.load()])
  assert.deepEqual([asked, store.available, store.state.loadFailure], [1, undefined, "not logged in"])
  fail = false
  await store.load()
  assert.deepEqual([asked, store.available?.version, store.state.loadFailure], [2, "0.9.0", undefined], "a 401 before login doesn't stick")
})

test("Check now replaces what is shown, and a refusal is shown without losing it", async () => {
  let refuse = false
  const store = new AppUpdateStore({
    get: async () => dto(),
    check: async () => (refuse ? Promise.reject(new Error("update checks are switched off")) : dto({ checkedAt: 5 })),
    setEnabled: async enabled => dto({ enabled })
  })
  await store.check()
  assert.deepEqual([store.state.update?.checkedAt, store.state.checking], [5, false])
  refuse = true
  await store.check()
  assert.deepEqual([store.state.update?.checkedAt, store.state.failure], [5, "update checks are switched off"])
  await store.setEnabled(false)
  assert.deepEqual([store.state.update?.enabled, store.state.failure], [false, undefined])
})
