import type { PluginStore } from "@lox-nexus/plugin-sdk"
import type { ScriptRealm } from "../run/ScriptRealm.ts"
import { JsonCheck } from "./JsonCheck.ts"

/**
 * `nexus.store`: the plugin store, persisted across restarts. Keys get a prefix, so the plugin can
 * keep its own entries next to the script's later. Values must be JSON as they are; reads return
 * a fresh copy, so changing it doesn't change the stored value until `set` is called.
 */
export class ScriptStore {
  static readonly MAX_KEY_LENGTH = 128
  /** the largest value, as JSON text: the store is for small state, every set is a database write */
  static readonly MAX_VALUE_LENGTH = 65_536
  private static readonly prefix = "script:"

  constructor(private readonly store: PluginStore, private readonly realm: ScriptRealm) {}

  build() {
    return Object.freeze({
      get: (key: unknown) => this.realm.adopt(this.store.get(this.key("get", key))),
      set: (key: unknown, value: unknown) => this.set(this.key("set", key), value)
    })
  }

  private set(key: string, value: unknown) {
    if (value === undefined) {
      this.store.delete(key)
      return
    }
    const problem = JsonCheck.problem(value)
    if (problem) throw this.realm.typeError(`nexus.store.set: only JSON can be stored: ${problem}`)
    const length = JSON.stringify(value).length
    if (length > ScriptStore.MAX_VALUE_LENGTH) {
      throw this.realm.typeError(`nexus.store.set: the value is ${length} characters as JSON, more than ${ScriptStore.MAX_VALUE_LENGTH}`)
    }
    this.store.set(key, value)
  }

  private key(method: string, key: unknown): string {
    if (typeof key !== "string" || key.length === 0 || key.length > ScriptStore.MAX_KEY_LENGTH) {
      throw this.realm.typeError(`nexus.store.${method}: the key must be a string of 1 to ${ScriptStore.MAX_KEY_LENGTH} characters`)
    }
    return ScriptStore.prefix + key
  }
}
