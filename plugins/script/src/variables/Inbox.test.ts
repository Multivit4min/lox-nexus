import assert from "node:assert/strict"
import { afterEach, describe, mock, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { Inbox } from "./Inbox.ts"
import { VariableTable } from "./VariableTable.ts"

// the test host waits for answers with setTimeout, so a 30 s fake wait can't go through it
describe("Inbox", () => {
  afterEach(() => mock.timers.reset())

  test("a handler that never settles fails its command after 30 s; the next command runs", async () => {
    mock.timers.enable({ apis: ["setTimeout"] })
    const inbox = new Inbox(new VariableTable(() => {}), (_, error) => String(error), value => value)
    const seen: unknown[] = []
    inbox.on("x", (...args) => (args[0] === 1 ? new Promise(() => {}) : void seen.push(args[0])))
    const first = inbox.receive("x", Value.number(1))
    mock.timers.tick(Inbox.HANDLER_LIMIT_MS - 1)
    let settled = false
    void first.catch(() => (settled = true))
    await Promise.resolve()
    assert.equal(settled, false)
    mock.timers.tick(1)
    await assert.rejects(first, { message: "a nexus.on handler did not settle within 30 s" })
    await inbox.receive("x", Value.number(2))
    assert.deepEqual(seen, [2])
    await inbox.dispose()
  })
})
