import { parentPort } from "node:worker_threads"
import { Plugin, PluginEntry } from "@lox-nexus/plugin-sdk"

/** sends a message type from the future, as a plugin built with a newer SDK would */
class ChattyPlugin extends Plugin {
  override start() {
    parentPort?.postMessage({ type: "telemetry.v2", payload: 1 })
  }
}

export default PluginEntry.define(ChattyPlugin)
