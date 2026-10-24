import { PluginNotRunningError, type PluginManager } from "@lox-nexus/core"
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import type { Controller } from "../Controller.ts"

/**
 * /hook/<instance slug>/<path>: webhooks into plugins, any method, without a session (the caller
 * is another system). The plugin must check a secret itself. The body is passed on as text.
 *
 * - 404: no instance with that slug, or the plugin has no such route
 * - 503: the instance isn't running
 * - 502: the plugin's handler failed or didn't answer (details go to the log, not the caller)
 * - otherwise whatever the plugin answers
 */
export class HookController implements Controller {
  constructor(private readonly plugins: Pick<PluginManager, "list">) {}

  register(app: FastifyInstance) {
    // webhooks send JSON, form data or plain text; the plugin decides how to read it
    app.removeAllContentTypeParsers()
    app.addContentTypeParser("*", { parseAs: "string" }, (_request, body, done) => done(null, body))
    app.all("/hook/:slug/*", (request, reply) => this.forward(request, reply))
  }

  private async forward(request: FastifyRequest, reply: FastifyReply) {
    const { slug, "*": rest } = request.params as { slug: string; "*": string }
    const supervisor = this.plugins.list().find(candidate => candidate.config.slug === slug)
    if (!supervisor) return reply.code(404).send({ error: "not found" })
    try {
      const response = await supervisor.calls.http({
        method: request.method, path: `/${rest}`, body: typeof request.body === "string" ? request.body : "",
        query: HookController.strings(request.query), headers: HookController.strings(request.headers)
      })
      return reply.code(response.status).headers(response.headers).send(response.body)
    } catch (error) {
      if (error instanceof PluginNotRunningError) return reply.code(503).send({ error: "the plugin is not running" })
      request.log.warn({ err: error, instance: supervisor.config.id }, "webhook failed")
      return reply.code(502).send({ error: "the plugin could not handle the request" })
    }
  }

  // repeated headers and query keys are joined, as the plugin protocol carries plain strings
  private static strings(record: unknown): Record<string, string> {
    const entries = Object.entries((record ?? {}) as Record<string, unknown>)
    return Object.fromEntries(entries.filter(([, value]) => value !== undefined).map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : String(value)]))
  }
}
