import type { PluginStore } from "@lox-nexus/plugin-sdk"

/** A plugin store in memory that checks what the real one checks (key length, JSON values). */
export class MemoryStore implements PluginStore {
  readonly data = new Map<string, unknown>()
  writes = 0

  get<T = unknown>(key: string) {
    return this.data.get(key) as T | undefined
  }

  set(key: string, value: unknown) {
    if (key.length < 1 || key.length > 200) throw new Error(`store keys are 1 to 200 characters: ${key}`)
    this.data.set(key, JSON.parse(JSON.stringify(value)))
    this.writes++
  }

  delete(key: string) {
    this.data.delete(key)
  }

  keys() {
    return [...this.data.keys()]
  }
}
