import type { SignalDto } from "@lox-nexus/api"
import type { EventBus, SignalRegistry } from "@lox-nexus/core"
import type { FastifyInstance } from "fastify"
import { z } from "zod"
import type { WireService } from "../../services/WireService.ts"
import type { Controller } from "../Controller.ts"

const IdParams = z.object({ id: z.string().min(1) })

/**
 * /api/signals and /api/wires: every registered signal with its current value, and the wires
 * between them. All routes need a session (401 otherwise).
 *
 * - GET /api/signals: 200.
 * - GET /api/wires: 200, including wires that failed to start (`active: false`).
 * - POST /api/wires: 201; 400 invalid body; 409 unknown signal or the target already has a wire.
 * - PUT /api/wires/:id: 200; 400 / 409 as above, 404 unknown wire. The old wire keeps running on failure.
 * - DELETE /api/wires/:id: 204; 404 unknown wire.
 * - POST /api/wires/preview: 200 with the value after each transform; 400 invalid transforms, 404 unknown target.
 */
export class SignalController implements Controller {
  constructor(
    private readonly signals: Pick<SignalRegistry, "list">,
    private readonly bus: Pick<EventBus, "current">,
    private readonly wires: WireService
  ) {}

  /** the wire bodies are validated by WireService, which owns the transform schema */
  register(app: FastifyInstance) {
    app.get("/api/signals", (): SignalDto[] => this.signals.list().map(signal => {
      const current = this.bus.current(signal.topic)
      return { ...signal, ...(current ? { current } : {}) }
    }))
    app.get("/api/wires", () => this.wires.list())
    app.post("/api/wires/preview", request => this.wires.preview(request.body))
    app.post("/api/wires", (request, reply) => reply.code(201).send(this.wires.create(request.body)))
    app.put("/api/wires/:id", request => this.wires.update(IdParams.parse(request.params).id, request.body))
    app.delete("/api/wires/:id", (request, reply) => {
      this.wires.delete(IdParams.parse(request.params).id)
      return reply.code(204).send()
    })
  }
}
