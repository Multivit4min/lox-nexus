import { EventEmitter } from "node:events"
import type { PluginClass } from "@lox-nexus/plugin-sdk"
import { PluginRuntimeForTests } from "@lox-nexus/plugin-sdk/testing"
import { WorkerMessageSchema, type HostMessage } from "@lox-nexus/plugin-sdk/wire"
import type { PluginConnection, PluginConnectionEvents, PluginTransport } from "../plugins/PluginTransport.ts"

/** A plugin "worker" in-process: the SDK's runtime behind a connection, messages delivered as microtasks. */
export class FakePluginConnection extends EventEmitter<PluginConnectionEvents> implements PluginConnection {
  /** every host message sent to the plugin, including pings */
  readonly received: HostMessage[] = []
  /** true once crash() or terminate() ended it; later messages are dropped */
  gone = false
  /** set to stop answering pings, like a hung worker */
  hung = false
  private readonly runtime: PluginRuntimeForTests

  constructor(type: PluginClass) {
    super()
    this.runtime = new PluginRuntimeForTests(type, message => queueMicrotask(() => {
      if (!this.gone) this.emit("message", WorkerMessageSchema.parse(message))
    }))
    queueMicrotask(() => this.runtime.hello())
  }

  send(message: HostMessage) {
    this.received.push(message)
    if (this.gone || (this.hung && message.type === "ping")) return
    queueMicrotask(() => void this.runtime.handle(message))
  }

  /** simulates the worker dying, e.g. out of memory */
  crash(reason = "exited with code 1") {
    if (this.gone) return
    this.gone = true
    this.emit("exit", reason)
  }

  async terminate() {
    this.crash("was terminated")
  }
}

/** Opens FakePluginConnections; entries name the plugin classes registered with `add`. */
export class FakePluginTransport implements PluginTransport {
  /** every connection opened so far, oldest first (one per start or restart) */
  readonly opened: FakePluginConnection[] = []
  private readonly types = new Map<string, PluginClass>()

  /** registers a class under an entry name; open() of an unregistered entry throws */
  add(entry: string, type: PluginClass) {
    this.types.set(entry, type)
    return this
  }

  open(entry: string) {
    const type = this.types.get(entry)
    if (!type) throw new Error(`no fake plugin for ${entry}`)
    const connection = new FakePluginConnection(type)
    this.opened.push(connection)
    return connection
  }

  /** the most recent connection, i.e. the current worker of the instance under test */
  get last() {
    return this.opened.at(-1)!
  }
}
