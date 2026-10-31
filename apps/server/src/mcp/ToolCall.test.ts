import assert from "node:assert/strict"
import { test } from "node:test"
import { z } from "zod"
import { ChangeLock } from "../http/ChangeLock.ts"
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
