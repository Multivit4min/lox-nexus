/** The parts of the script's globals the plugin builds per start. */
export interface ScriptParts {
  nexus: unknown
  console: unknown
  timers: Record<string, unknown>
  fetch: unknown
}

/**
 * The global variables of a script. Besides what the plugin builds (nexus, console, timers,
 * fetch) it gets the web-standard classes and functions of the host. No `require`, `process`,
 * `Buffer` or module loading: a script talks to Nexus through `nexus` and to the network
 * through `fetch`.
 */
export class ScriptGlobals {
  static build(parts: ScriptParts): Record<string, unknown> {
    return {
      ...parts.timers,
      nexus: parts.nexus,
      console: parts.console,
      fetch: parts.fetch,
      Headers,
      Request,
      Response,
      AbortController,
      AbortSignal,
      URL,
      URLSearchParams,
      TextEncoder,
      TextDecoder,
      structuredClone,
      atob,
      btoa,
      crypto: globalThis.crypto
    }
  }
}
