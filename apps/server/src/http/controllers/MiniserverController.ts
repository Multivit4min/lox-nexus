import { AdoptPacketSchema, LoxoneSignalInputSchema, MiniserverInputSchema } from "@lox-nexus/api"
import type { FastifyInstance, FastifyRequest } from "fastify"
import { z } from "zod"
import type { LoxoneSignalService } from "../../services/LoxoneSignalService.ts"
import type { MiniserverService } from "../../services/MiniserverService.ts"
import type { Controller } from "../Controller.ts"

const IdParams = z.object({ id: z.string().min(1) })
const SignalParams = IdParams.extend({ signalId: z.string().min(1) })

/** /api/miniservers: configs, start/stop, signals, and discovered packet ids. */
export class MiniserverController implements Controller {
  constructor(private readonly miniservers: MiniserverService, private readonly signals: LoxoneSignalService) {}

  register(app: FastifyInstance) {
    app.get("/api/miniservers", () => this.miniservers.list())
    app.post("/api/miniservers", async (request, reply) => reply.code(201).send(await this.miniservers.create(MiniserverInputSchema.parse(request.body))))
    app.get("/api/miniservers/:id", request => this.miniservers.get(MiniserverController.id(request)))
    app.put("/api/miniservers/:id", request => this.miniservers.update(MiniserverController.id(request), MiniserverInputSchema.parse(request.body)))
    app.delete("/api/miniservers/:id", async (request, reply) => {
      await this.miniservers.remove(MiniserverController.id(request))
      return reply.code(204).send()
    })
    app.post("/api/miniservers/:id/start", request => this.miniservers.start(MiniserverController.id(request)))
    app.post("/api/miniservers/:id/stop", request => this.miniservers.stop(MiniserverController.id(request)))
    this.registerSignals(app)
  }

  private registerSignals(app: FastifyInstance) {
    app.get("/api/miniservers/:id/signals", request => this.signals.list(MiniserverController.id(request)))
    app.post("/api/miniservers/:id/signals", (request, reply) =>
      reply.code(201).send(this.signals.add(MiniserverController.id(request), LoxoneSignalInputSchema.parse(request.body))))
    app.delete("/api/miniservers/:id/signals/:signalId", (request, reply) => {
      const { id, signalId } = SignalParams.parse(request.params)
      this.signals.remove(id, signalId)
      return reply.code(204).send()
    })
    app.get("/api/miniservers/:id/discovered", request => this.signals.discovered(MiniserverController.id(request)))
    app.post("/api/miniservers/:id/discovered/adopt", (request, reply) =>
      reply.code(201).send(this.signals.adopt(MiniserverController.id(request), AdoptPacketSchema.parse(request.body))))
  }

  private static id(request: FastifyRequest) {
    return IdParams.parse(request.params).id
  }
}
