import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { test } from "node:test"
import type { HostMessage, WorkerMessage } from "@lox-nexus/plugin-sdk/wire"
import { PluginSession } from "./PluginSession.ts"
import { DEFAULT_TIMINGS } from "./PluginSupervisor.ts"
import type { PluginConnection, PluginConnectionEvents } from "./PluginTransport.ts"

/** a hand-written worker: says hello as given, answers init with ready */
class ScriptedWorker extends EventEmitter<PluginConnectionEvents> implements PluginConnection {
  readonly received: HostMessage[] = []

  constructor(hello: WorkerMessage) {
    super()
    queueMicrotask(() => this.emit("message", hello))
  }

  send(message: HostMessage) {
    this.received.push(message)
    if (message.type === "init") queueMicrotask(() => this.emit("message", { type: "ready" }))
    if (message.type === "shutdown") queueMicrotask(() => this.emit("message", { type: "stopped" }))
  }

  async terminate() {}
}

const init = { instanceId: "i", slug: "s", config: {}, store: {}, logLevel: "info" as const }
const levels = (worker: ScriptedWorker) => worker.received.flatMap(message => (message.type === "log.level" ? [message.level] : []))

test("an older worker (no features in hello) gets the level in init only; log.level would be invalid to it", async () => {
  const worker = new ScriptedWorker({ type: "hello", version: 1 })
  const session = new PluginSession(worker, DEFAULT_TIMINGS)
  await session.open(init)
  session.logLevel("debug")
  assert.deepEqual(worker.received.find(message => message.type === "init"), { type: "init", ...init })
  assert.deepEqual(levels(worker), [])
  await session.close()
})

test("a worker that knows the feature hears changes, never the level it has already", async () => {
  const worker = new ScriptedWorker({ type: "hello", version: 1, features: ["log.level"] })
  const session = new PluginSession(worker, DEFAULT_TIMINGS)
  await session.open({ ...init, timeZone: undefined })
  session.logLevel("info")
  session.logLevel(undefined)
  session.logLevel("debug")
  session.logLevel("debug")
  assert.equal("timeZone" in worker.received[0]!, false, "an undefined optional field is left out of init")
  assert.deepEqual(levels(worker), ["debug"])
  await session.close()
  session.logLevel("info")
  assert.deepEqual(levels(worker), ["debug"], "nothing after close")
})
