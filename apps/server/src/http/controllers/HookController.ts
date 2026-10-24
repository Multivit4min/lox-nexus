import { PluginNotRunningError, type PluginManager } from "@lox-nexus/core"
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import type { Controller } from "../Controller.ts"

/**
 * /hook/<instance slug>/<path>: webhooks into plugins, any method, without a session (the caller
 * is another system). The plugin must check a secret itself. The body is passed on as text.
 *
 * The route shares the admin UI's origin, so neither side may touch the session: the session
 * cookie is not forwarded to the plugin, a plugin can't set cookies, and every answer is sandboxed
 * (CSP sandbox, nosniff), so a plugin echoing input as HTML can't run script on this origin.
 *
 * - 404: no instance with that slug, or the plugin has no such route
 * - 429: too many calls to the instance at once
 * - 503: the instance isn't running
 * - 502: the plugin's handler failed or didn't answer (details go to the log, not the caller)
 * - otherwise whatever the plugin answers
 */
export class HookController implements Controller {
  /** concurrent calls per instance; each holds a body and a request slot until the plugin answers */
  static readonly MAX_IN_FLIGHT = 8
  /** request headers kept from the plugin: the session, and what only concerns this connection */
  private static readonly DROPPED_REQUEST = new Set(["cookie", "connection", "keep-alive", "transfer-encoding", "upgrade", "proxy-authorization"])
  /** response headers a plugin may not set: cookies, framing, and the protections set here */
  private static readonly DROPPED_RESPONSE = new Set([
    "set-cookie", "set-cookie2", "content-length", "transfer-encoding", "connection", "keep-alive", "upgrade",
    "content-security-policy", "x-content-type-options"
  ])
  private readonly inFlight = new Map<string, number>()

  constructor(private readonly plugins: Pick<PluginManager, "list">) {}

  register(app: FastifyInstance) {
    // webhooks send JSON, form data or plain text; the plugin decides how to read it
    app.removeAllContentTypeParsers()
    app.addContentTypeParser("*", { parseAs: "string" }, (_request, body, done) => done(null, body))
    app.addHook("onSend", async (_request, reply) => {
      reply.header("content-security-policy", "sandbox; default-src 'none'").header("x-content-type-options", "nosniff").header("cache-control", "no-store")
    })
    app.all("/hook/:slug/*", (request, reply) => this.forward(request, reply))
  }

  private async forward(request: FastifyRequest, reply: FastifyReply) {
    const { slug, "*": rest } = request.params as { slug: string; "*": string }
    const supervisor = this.plugins.list().find(candidate => candidate.config.slug === slug)
    if (!supervisor) return reply.code(404).send({ error: "not found" })
    const busy = this.inFlight.get(slug) ?? 0
    if (busy >= HookController.MAX_IN_FLIGHT) return reply.code(429).send({ error: "too many requests" })
    this.inFlight.set(slug, busy + 1)
    try {
      const response = await supervisor.calls.http({
        method: request.method, path: `/${rest}`, body: typeof request.body === "string" ? request.body : "",
        query: HookController.strings(request.query), headers: HookController.strings(request.headers, HookController.DROPPED_REQUEST)
      })
      return reply.code(response.status).headers(HookController.strings(response.headers, HookController.DROPPED_RESPONSE)).send(response.body)
    } catch (error) {
      if (error instanceof PluginNotRunningError) return reply.code(503).send({ error: "the plugin is not running" })
      request.log.warn({ err: error, instance: supervisor.config.id }, "webhook failed")
      return reply.code(502).send({ error: "the plugin could not handle the request" })
    } finally {
      const left = (this.inFlight.get(slug) ?? 1) - 1
      if (left > 0) this.inFlight.set(slug, left)
      else this.inFlight.delete(slug)
    }
  }

  // repeated headers and query keys are joined, as the plugin protocol carries plain strings
  private static strings(record: unknown, dropped: ReadonlySet<string> = new Set()): Record<string, string> {
    const entries = Object.entries((record ?? {}) as Record<string, unknown>)
    return Object.fromEntries(entries
      .filter(([key, value]) => value !== undefined && !dropped.has(key.toLowerCase()))
      .map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : String(value)]))
  }
}
