import assert from "node:assert/strict"
import { test } from "node:test"
import { HostMessageSchema, WIRE_VERSION } from "./HostMessages.ts"
import { WorkerMessageSchema } from "./WorkerMessages.ts"

// Frozen samples of wire version 1. Plugins built against this version send and expect exactly
// these shapes; a change that makes one fail breaks them and needs a new WIRE_VERSION.
const host = [
  { type: "init", instanceId: "i", config: { host: "x" }, store: { k: 1 } },
  { type: "describe", requestId: 1 },
  { type: "signal.add", requestId: 2, signal: { id: "s", kind: "sensor", capability: "c", params: {} } },
  { type: "signal.remove", requestId: 3, id: "s" },
  { type: "actuate", requestId: 4, signalId: "a", value: { type: "number", value: 1 }, causeId: "m" },
  { type: "catalog", requestId: 5 },
  { type: "panel", requestId: 6 },
  { type: "http.request", requestId: 7, request: { method: "POST", path: "/x", query: {}, headers: {}, body: "" } },
  { type: "ping", seq: 1 },
  { type: "shutdown" },
  // optional additions within version 1: older plugins ignore them, older hosts don't send them
  { type: "init", instanceId: "i", slug: "home", config: {}, store: {} },
  { type: "signal.add", requestId: 8, signal: { id: "s", kind: "sensor", capability: "c", params: {}, label: "Kitchen" } },
  // only sent to plugins that declare `watches`, so older plugins never see them
  { type: "watch.signals", signals: [{ id: "s", topic: "loxone/home/in/t", label: "T", valueType: "number", owner: { kind: "miniserver", id: "m" } }] },
  { type: "watch.values", seq: 0, values: [{ signalId: "s", ts: 1, kind: "state", value: { type: "number", value: 1 }, forced: true, initial: true }], dropped: 2 }
]
const worker = [
  { type: "hello", version: 1 },
  { type: "ready" },
  { type: "failed", error: "e" },
  { type: "emit", signalId: "s", value: { type: "boolean", value: true }, causeId: "m" },
  { type: "status", status: "degraded", message: "m" },
  { type: "log", level: "warn", message: "m", data: { a: 1 }, causeId: "m" },
  { type: "store.set", key: "k", value: [1] },
  { type: "store.delete", key: "k" },
  { type: "response", requestId: 1, ok: false, error: "e" },
  { type: "signal.error", signalId: "s", error: "e" },
  { type: "signal.recovered", signalId: "s" },
  { type: "pong", seq: 1 },
  { type: "stopped" },
  // an addition within version 1: only an answer to watch.values, which older hosts never send
  { type: "watch.ack", seq: 0 }
]

test("wire version 1 messages keep parsing", () => {
  assert.equal(WIRE_VERSION, 1)
  for (const message of host) assert.ok(HostMessageSchema.safeParse(message).success, JSON.stringify(message))
  for (const message of worker) assert.ok(WorkerMessageSchema.safeParse(message).success, JSON.stringify(message))
})

test("the host refuses what a worker must not send", () => {
  const refused = [
    { type: "emit", signalId: "s", value: { type: "number", value: "1" } },
    { type: "log", level: "trace", message: "m" },
    { type: "status", status: "error" },
    { type: "log", level: "info", message: "x".repeat(10_001) },
    { type: "nope" }
  ]
  for (const message of refused) assert.equal(WorkerMessageSchema.safeParse(message).success, false, JSON.stringify(message))
})
