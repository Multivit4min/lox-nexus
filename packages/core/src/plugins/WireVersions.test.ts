import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { test } from "node:test"
import { WIRE_VERSION } from "@lox-nexus/plugin-sdk/wire"
import { InitFailedError, PluginSession } from "./PluginSession.ts"
import { DEFAULT_TIMINGS } from "./PluginSupervisor.ts"
import type { PluginConnection, PluginConnectionEvents } from "./PluginTransport.ts"
import { WireVersions } from "./WireVersions.ts"

/** a worker that only says hello with the given wire version */
class HelloWorker extends EventEmitter<PluginConnectionEvents> implements PluginConnection {
  constructor(version: number) {
    super()
    queueMicrotask(() => this.emit("message", { type: "hello", version }))
  }

  send() {}

  async terminate() {}
}

test("the SDK's current wire version runs; the refusal names the side to update", () => {
  const supported = WireVersions.SUPPORTED.join(" or ")
  const newer = Math.max(...WireVersions.SUPPORTED) + 1
  const older = Math.min(...WireVersions.SUPPORTED) - 1
  assert.ok(WireVersions.accepts(WIRE_VERSION))
  assert.equal(WireVersions.refusal(WIRE_VERSION), undefined)
  assert.ok(WireVersions.refusal(newer)?.endsWith(`needs wire version ${newer}, this Nexus runs ${supported}: update Nexus`))
  assert.ok(WireVersions.refusal(older)?.endsWith(`speaks wire version ${older}, which this Nexus no longer runs (${supported}): update the plugin`))
})

test("a session refuses a plugin of a version it doesn't run before init, as a start failure", async () => {
  const session = new PluginSession(new HelloWorker(WIRE_VERSION + 1), DEFAULT_TIMINGS)
  await assert.rejects(session.greet(), (error: unknown) => error instanceof InitFailedError && /update Nexus/.test(error.message))
  await session.dispose()
})
