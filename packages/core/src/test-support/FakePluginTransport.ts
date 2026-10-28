import type { PluginClass } from "@lox-nexus/plugin-sdk"
import type { PluginTransport } from "../plugins/PluginTransport.ts"
import { FakePluginConnection } from "./FakePluginConnection.ts"

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
