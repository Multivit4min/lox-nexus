import type { HttpRequest } from "../wire/HostMessages.ts"
import type { HttpResponse } from "../wire/Shapes.ts"
import type { LogLevel, PluginHealth } from "../wire/WorkerMessages.ts"

/** Log lines go to the host's log, tagged with the instance and the bus message being handled. */
export type PluginLogger = Record<LogLevel, (message: string, data?: unknown) => void>

/**
 * Small persisted key-value state of one instance (tokens, cursors, "last seen" ids). Reads are
 * synchronous from memory; writes are sent to the host, which stores them.
 */
export interface PluginStore {
  /** the cast to `T` is not checked; validate data that an older version may have written */
  get<T = unknown>(key: string): T | undefined
  /**
   * The value must be JSON (it is stored as JSON; functions, undefined fields and class
   * instances are dropped or flattened, BigInt and cycles throw). Keys are 1 to 200 characters.
   * @throws Error for an invalid key or value
   */
  set(key: string, value: unknown): void
  /** removing an absent key is a no-op */
  delete(key: string): void
  keys(): string[]
}

/** The plugin's own view of its health: "degraded" with a message while something is wrong. */
export interface PluginStatus {
  /** `message` is clipped to 10 000 characters; "running" clears an earlier degraded state */
  set(status: PluginHealth, message?: string): void
}

/** A webhook handler; when it throws, the caller gets 502 and the error goes to the server log. */
export type HttpHandler = (request: HttpRequest) => HttpResponse | Promise<HttpResponse>

/** Webhook routes, reachable at /hook/<instance><path> without a login: check a secret yourself. */
export interface PluginHttp {
  /**
   * @param method e.g. "POST" (case-insensitive), or "*" for any method
   * @param path below the instance, e.g. "/github"; ending in "/*" it matches every path below
   *   that prefix ("/a/*" matches "/a/" and "/a/b", not "/a"; "/*" matches all). The most specific route wins: exact before prefix, longer
   *   prefix before shorter, a named method before "*". The handler sees the full `request.path`.
   * @throws Error when the method (case-insensitive) and path are already registered
   */
  route(method: string, path: string, handler: HttpHandler): void
}

/** Everything a plugin gets from the runtime. */
export interface PluginContext {
  /** stable for the life of the configured instance (webhook URLs use the instance's slug instead) */
  readonly instanceId: string
  /** the instance's slug: its topic segment and webhook path (/hook/<slug>/…); undefined with older hosts */
  readonly slug?: string
  /** already validated against the plugin's static `config` schema */
  readonly config: unknown
  readonly log: PluginLogger
  /** persisted across restarts and updates of this instance */
  readonly store: PluginStore
  readonly status: PluginStatus
  readonly http: PluginHttp
}
