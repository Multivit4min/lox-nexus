import assert from "node:assert/strict"
import { test } from "node:test"
import type { BusMessageDto, ForceDto, StreamEvent } from "@lox-nexus/api"
import type { BusApi } from "../api/BusApi.ts"
import type { StreamConnection, StreamHandlers } from "../api/StreamConnection.ts"
import { InspectorStore } from "./InspectorStore.ts"

const message = (seq: number, topic = "a/x", kind: BusMessageDto["kind"] = "state"): BusMessageDto => ({
  id: `m${seq}`, seq, ts: seq, topic, kind, source: { kind: "user", id: "t" }, traceId: `m${seq}`, depth: 0,
  ...(kind === "state" ? { value: { type: "number", value: seq } } : {})
})

const setup = () => {
  let handlers!: StreamHandlers
  const subscribed: string[] = []
  const stream = { subscribe: (_: string, pattern: string) => subscribed.push(pattern), open: () => {}, close: () => {} }
  let forceLoads = 0
  const api = {
    recent: async () => [message(1)],
    forces: async (): Promise<ForceDto[]> => (forceLoads++, [])
  } as unknown as BusApi
  const store = new InspectorStore(api, h => ((handlers = h), stream as unknown as StreamConnection))
  const emit = (event: StreamEvent) => handlers.onEvent(event)
  return { store, emit, subscribed, forceLoads: () => forceLoads }
}

test("history first, then live batches; pausing holds the list and counts what was missed", async () => {
  const { store, emit } = setup()
  await store.open()
  emit({ type: "bus", messages: [message(2), message(3)] })
  assert.deepEqual(store.messages.value.map(m => m.seq), [1, 2, 3])
  store.setPaused(true)
  emit({ type: "bus", messages: [message(4)] })
  assert.equal(store.messages.value.length, 3)
  assert.equal(store.state.missed, 1)
  store.setPaused(false)
  assert.deepEqual(store.messages.value.map(m => m.seq), [1, 2, 3, 4])
})

test("kind and text filters, gaps, and force reloads", async () => {
  const { store, emit, forceLoads } = setup()
  await store.open()
  emit({ type: "bus", messages: [message(2, "b/y"), message(3, "a/x", "force")] })
  emit({ type: "gap", dropped: 7 })
  store.toggleKind("force")
  store.setText("b/")
  assert.deepEqual(store.visible().map(m => m.seq), [2])
  assert.equal(store.state.dropped, 7)
  assert.equal(forceLoads(), 2, "loaded on open and again after the force message")
})

test("a new pattern resubscribes and starts over", async () => {
  const { store, subscribed } = setup()
  await store.open()
  await store.follow("loxone/#")
  assert.deepEqual(subscribed, ["#", "loxone/#"])
  assert.deepEqual(store.messages.value.map(m => m.seq), [1])
})
