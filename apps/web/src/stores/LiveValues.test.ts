import assert from "node:assert/strict"
import { test } from "node:test"
import type { BusMessageDto } from "@lox-nexus/api"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { StreamConnection, StreamHandlers } from "../api/StreamConnection.ts"
import { LiveValues } from "./LiveValues.ts"

const message = (topic: string, value: number) => ({ topic, value: Value.number(value) }) as BusMessageDto

test("state batches merge; cleared topics are removed", () => {
  let handlers: StreamHandlers | undefined
  const connect = (given: StreamHandlers) => {
    handlers = given
    return { subscribe: () => {}, open: () => {}, close: () => {} } as unknown as StreamConnection
  }
  const live = new LiveValues(connect, "a/#")
  handlers!.onEvent({ type: "state", messages: [message("a/x", 1), message("a/y", 2)], full: true })
  handlers!.onEvent({ type: "state", messages: [message("a/y", 3)], cleared: ["a/x"] })
  assert.deepEqual([...live.values.keys()], ["a/y"])
  assert.deepEqual(live.get("a/y")?.value, Value.number(3))
})
