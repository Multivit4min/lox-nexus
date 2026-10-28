/**
 * Caps on what a plugin sends the host, besides message text (capped in PluginRuntime). Plugins are
 * trusted code (ADR 0001), so these catch mistakes: a log line carrying a whole API response, a
 * store value that grows every poll, a catalog that tries to list everything. Sizes are JSON
 * lengths in characters, which is what the host stores and the UI receives.
 */
export class MessageLimits {
  /** one store value; the host writes it to the database on every set() */
  static readonly STORE_VALUE = 1024 * 1024
  /** the data of one log line; kept in memory and shown on the instance page */
  static readonly LOG_DATA = 64 * 1024
  /** an answer to the host (catalog, panel, webhook response) */
  static readonly ANSWER = 16 * 1024 * 1024

  /** the JSON length, or undefined when JSON can't hold the value (BigInt, cycles) */
  static size(value: unknown) {
    try {
      return JSON.stringify(value)?.length ?? 0
    } catch {
      return undefined
    }
  }

  /** "1.5 MiB", "12 KiB" */
  static describe(characters: number) {
    return characters >= 1024 * 1024 ? `${(characters / 1024 / 1024).toFixed(1)} MiB` : `${Math.ceil(characters / 1024)} KiB`
  }
}
