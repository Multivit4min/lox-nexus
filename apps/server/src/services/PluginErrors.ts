import { PluginNotRunningError, PluginRequestError, PluginUnavailableError } from "@lox-nexus/core"
import { HttpError } from "../http/HttpError.ts"

/** What the plugin runtime throws, as the HTTP answers of PluginService. */
export class PluginErrors {
  /** a plugin that throws in catalog() or panel() is a failing upstream: 502 with its message */
  static async running<T>(work: () => Promise<T>) {
    try {
      return await work()
    } catch (error) {
      if (error instanceof PluginNotRunningError) throw HttpError.conflict(error.message)
      if (error instanceof PluginRequestError) throw new HttpError(502, `the plugin failed: ${error.message}`)
      if (error instanceof PluginUnavailableError) throw new HttpError(503, error.message)
      throw error
    }
  }

  /** a domain error of the manager (a taken slug, …) as its HTTP status */
  static domain<T>(work: () => T): T {
    try {
      return work()
    } catch (error) {
      throw HttpError.fromDomain(error)
    }
  }

  /** domain() for async work */
  static async domainAsync<T>(work: () => Promise<T>) {
    try {
      return await work()
    } catch (error) {
      throw HttpError.fromDomain(error)
    }
  }
}
