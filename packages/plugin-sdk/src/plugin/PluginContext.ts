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
  get<T = unknown>(key: string): T | undefined
  /** the value must survive structured cloning (plain data) */
  set(key: string, value: unknown): void
  delete(key: string): void
  keys(): string[]
}

/** The plugin's own view of its health: "degraded" with a message while something is wrong. */
export interface PluginStatus {
  set(status: PluginHealth, message?: string): void
}

/** A webhook handler; it may throw, which answers 500. */
export type HttpHandler = (request: HttpRequest) => HttpResponse | Promise<HttpResponse>

/** Webhook routes, reachable at /hook/<instance><path> without a login: check a secret yourself. */
export interface PluginHttp {
  /** @param path exact path below the instance, e.g. "/github" */
  route(method: string, path: string, handler: HttpHandler): void
}

/** Everything a plugin gets from the runtime. */
export interface PluginContext {
  readonly instanceId: string
  /** already validated against the plugin's static `config` schema */
  readonly config: unknown
  readonly log: PluginLogger
  readonly store: PluginStore
  readonly status: PluginStatus
  readonly http: PluginHttp
}
