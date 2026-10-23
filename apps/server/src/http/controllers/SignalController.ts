import type { SignalDto } from "@lox-nexus/api"
import type { EventBus, SignalRegistry } from "@lox-nexus/core"
import type { FastifyInstance } from "fastify"
import { z } from "zod"
import type { WireService } from "../../services/WireService.ts"
import type { Controller } from "../Controller.ts"

const IdParams = z.object({ id: z.string().min(1) })

/** /api/signals and /api/wires: every registered signal with its current value, and the wires between them. */
export class SignalController implements Controller {
  constructor(
    private readonly signals: Pick<SignalRegistry, "list">,
    private readonly bus: Pick<EventBus, "current">,
    private readonly wires: WireService
  ) {}

  register(app: FastifyInstance) {
    app.get("/api/signals", (): SignalDto[] => this.signals.list().map(signal => {
      const current = this.bus.current(signal.topic)
      return { ...signal, ...(current ? { current } : {}) }
    }))
    app.get("/api/wires", () => this.wires.list())
    app.post("/api/wires", (request, reply) => reply.code(201).send(this.wires.create(request.body)))
    app.put("/api/wires/:id", request => this.wires.update(IdParams.parse(request.params).id, request.body))
    app.delete("/api/wires/:id", (request, reply) => {
      this.wires.delete(IdParams.parse(request.params).id)
      return reply.code(204).send()
    })
  }
}
