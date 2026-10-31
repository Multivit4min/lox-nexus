import assert from "node:assert/strict"
import { test } from "node:test"
import { z } from "zod"
import { TestClock } from "@lox-nexus/plugin-sdk/testing"
import { ChangeLock } from "../http/ChangeLock.ts"
import { Confirmations } from "./Confirmations.ts"
import type { McpTool } from "./McpTool.ts"
import { ToolCall } from "./ToolCall.ts"
import type { ToolContext } from "./ToolContext.ts"

const context: ToolContext = { user: { id: "u1", username: "admin" }, access: { tokenId: "t1", name: "agent", scopes: ["read", "configure"] }, by: "admin via MCP (agent)", signal: new AbortController().signal }

test("a changing tool takes the ChangeLock: refused while a config import holds it, and the lock and rate limit are always given back", async () => {
  const lock = new ChangeLock()
  let releases = 0
  const call = new ToolCall({ acquire: async () => () => void releases++ }, lock, { changed: () => {} }, { error: () => {} })
  let ran = 0
  const change: McpTool<Record<string, never>> = { name: "change", title: "Change", description: "", scope: "configure", changes: true, input: z.object({}), run: () => void ran++ }
  const failing: McpTool<Record<string, never>> = { ...change, name: "failing", run: () => { throw new Error("boom") } }
  let finish = () => {}
  const held = lock.hold("a config import", () => new Promise<void>(resolve => (finish = resolve)))
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(await call.run(change, {}, context), { content: [{ type: "text", text: "a config import is running; try again when it is done" }], isError: true })
  assert.equal(ran, 0)
  finish()
  await held
  assert.equal((await call.run(change, {}, context)).isError, undefined)
  assert.equal((await call.run(failing, {}, context)).isError, true)
  await assert.doesNotReject(lock.hold("another import", async () => {}), "the failing tool gave the lock back")
  assert.equal(releases, 3, "and its rate-limit slot, every time")
})

test("a destructive tool answers what it would take along first, and runs only with that confirmation, once", async () => {
  const confirmations = new Confirmations()
  const call = new ToolCall({ acquire: async () => () => {} }, undefined, { changed: () => {} }, { error: () => {} }, confirmations)
  const deleted: string[] = []
  const remove: McpTool<{ signal: string; confirmation?: string }> = {
    name: "delete_thing", title: "Delete", description: "", scope: "configure", changes: true,
    input: z.object({ signal: z.string(), confirmation: z.string().optional() }),
    confirm: input => `deletes ${input.signal} and 2 wires`,
    run: input => void deleted.push(input.signal)
  }
  const first = JSON.parse((await call.run(remove, { signal: "a" }, context)).content[0]!.text) as { needsConfirmation: boolean; summary: string; confirmation: string }
  assert.deepEqual([first.needsConfirmation, first.summary, deleted], [true, "deletes a and 2 wires", []])
  assert.equal((await call.run(remove, { signal: "b", confirmation: first.confirmation }, context)).isError, true, "other arguments")
  const again = JSON.parse((await call.run(remove, { signal: "a" }, context)).content[0]!.text) as { confirmation: string }
  const other = { ...context, access: { ...context.access, tokenId: "t2" } }
  assert.equal((await call.run(remove, { signal: "a", confirmation: again.confirmation }, other)).isError, true, "another token")
  const third = JSON.parse((await call.run(remove, { signal: "a" }, context)).content[0]!.text) as { confirmation: string }
  assert.equal((await call.run(remove, { signal: "a", confirmation: third.confirmation }, context)).isError, undefined)
  assert.equal((await call.run(remove, { signal: "a", confirmation: third.confirmation }, context)).isError, true, "used once")
  assert.deepEqual(deleted, ["a"])
  await confirmations.dispose()
})

test("a tool past its deadline answers that it goes on; the lock is held until it really ends", async () => {
  const clock = new TestClock()
  const lock = new ChangeLock()
  const call = new ToolCall({ acquire: async () => () => {} }, lock, { changed: () => {} }, { error: () => {} }, undefined, clock)
  let finish = () => {}
  const slow: McpTool<Record<string, never>> = {
    name: "slow", title: "Slow", description: "", scope: "configure", changes: true, timeoutMs: 1000, input: z.object({}),
    run: () => new Promise<void>(resolve => (finish = resolve))
  }
  const answer = call.run(slow, {}, context)
  await new Promise(resolve => setImmediate(resolve))
  await clock.advance(1000)
  assert.match((await answer).content[0]!.text, /no answer within 1 s; it goes on in the background/)
  let imported = false
  const importing = lock.hold("a config import", async () => void (imported = true))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(imported, false, "still held by the running tool")
  finish()
  await importing
  assert.equal(imported, true)
})
