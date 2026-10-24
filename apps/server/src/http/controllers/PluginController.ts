import { PluginInstanceInputSchema, PluginSignalInputSchema } from "@lox-nexus/api"
import type { FastifyInstance, FastifyRequest } from "fastify"
import { z } from "zod"
import type { PluginService } from "../../services/PluginService.ts"
import type { PluginSignalService } from "../../services/PluginSignalService.ts"
import type { Controller } from "../Controller.ts"

const IdParams = z.object({ id: z.string().min(1) })
const SignalParams = IdParams.extend({ signalId: z.string().min(1) })

/**
 * /api/plugins (what can be instantiated) and /api/plugin-instances. All routes need a session.
 * Common answers: 400 invalid body, unknown plugin or capability, or params the plugin refused;
 * 404 unknown instance or signal; 409 taken slug, unavailable plugin, or (catalog, panel) an
 * instance that isn't running.
 *
 * - GET /api/plugins: 200 with every available plugin and its description.
 * - GET/POST /api/plugin-instances, GET/PUT/DELETE :id: 200 / 201 / 200 / 200 / 204. Create and
 *   update start the instance when enabled; a refusal shows up as `state: "error"`.
 * - POST :id/start, :id/stop: 200 with the instance.
 * - GET/POST :id/signals, PUT/DELETE :id/signals/:signalId: 200 / 201 / 200 / 204.
 * - GET :id/catalog, :id/panel: 200 with the plugin's answer.
 */
export class PluginController implements Controller {
  constructor(private readonly plugins: PluginService, private readonly signals: PluginSignalService) {}

  register(app: FastifyInstance) {
    app.get("/api/plugins", () => this.plugins.packages())
    app.get("/api/plugin-instances", () => this.plugins.list())
    app.post("/api/plugin-instances", async (request, reply) => reply.code(201).send(await this.plugins.create(PluginInstanceInputSchema.parse(request.body))))
    app.get("/api/plugin-instances/:id", request => this.plugins.get(PluginController.id(request)))
    app.put("/api/plugin-instances/:id", request =>
      this.plugins.update(PluginController.id(request), PluginInstanceInputSchema.parse(request.body), request.user!.username))
    app.delete("/api/plugin-instances/:id", async (request, reply) => {
      await this.plugins.remove(PluginController.id(request), request.user!.username)
      return reply.code(204).send()
    })
    app.post("/api/plugin-instances/:id/start", request => this.plugins.start(PluginController.id(request)))
    app.post("/api/plugin-instances/:id/stop", request => this.plugins.stop(PluginController.id(request)))
    app.get("/api/plugin-instances/:id/catalog", request => this.plugins.catalog(PluginController.id(request)))
    app.get("/api/plugin-instances/:id/panel", async request => (await this.plugins.panel(PluginController.id(request))) ?? null)
    this.registerSignals(app)
  }

  private registerSignals(app: FastifyInstance) {
    app.get("/api/plugin-instances/:id/signals", request => this.signals.list(PluginController.id(request)))
    app.post("/api/plugin-instances/:id/signals", async (request, reply) =>
      reply.code(201).send(await this.signals.add(PluginController.id(request), PluginSignalInputSchema.parse(request.body))))
    app.put("/api/plugin-instances/:id/signals/:signalId", request => {
      const { id, signalId } = SignalParams.parse(request.params)
      return this.signals.update(id, signalId, PluginSignalInputSchema.parse(request.body), request.user!.username)
    })
    app.delete("/api/plugin-instances/:id/signals/:signalId", async (request, reply) => {
      const { id, signalId } = SignalParams.parse(request.params)
      await this.signals.remove(id, signalId, request.user!.username)
      return reply.code(204).send()
    })
  }

  private static id(request: FastifyRequest) {
    return IdParams.parse(request.params).id
  }
}
