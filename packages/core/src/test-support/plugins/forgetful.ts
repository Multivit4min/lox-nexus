import { Plugin, PluginEntry } from "@lox-nexus/plugin-sdk"

/** rejects a promise nobody handles, once at start and again a moment later */
class ForgetfulPlugin extends Plugin {
  override start() {
    void Promise.reject(new Error("forgot to catch"))
    this.after(20, () => void Promise.reject(new Error("forgot again")))
  }
}

export default PluginEntry.define(ForgetfulPlugin)
