import { SelectionModeUpdateSchema, SelectionRulesUpdateSchema, type SelectionDto } from "@lox-nexus/api"
import type { FastifyInstance, FastifyRequest } from "fastify"
import { z } from "zod"
import type { SelectionService } from "../../services/SelectionService.ts"
import { HttpError } from "../HttpError.ts"
import type { Controller } from "../Controller.ts"

/**
 * /api/selections/:consumer: which signals a consumer takes. Consumers: "history" (plugin
 * instances that watch signals follow). All routes need a session; 404 for an unknown consumer.
 * - GET: 200 with mode and rules.
 * - PUT …/mode: 200 with the selection.
 * - PUT …/rules: 200 with the selection; sets the listed rules at once (`include: null` removes
 *   one), all or none; 400 when a target doesn't exist.
 */
export class SelectionController implements Controller {
  constructor(private readonly selections: Pick<SelectionService, "of" | "setMode" | "setRules">, private readonly consumers: (consumer: string) => boolean) {}

  register(app: FastifyInstance) {
    app.get("/api/selections/:consumer", request => this.dto(this.consumer(request)))
    app.put("/api/selections/:consumer/mode", request => {
      const consumer = this.consumer(request)
      this.selections.setMode(consumer, SelectionModeUpdateSchema.parse(request.body).mode)
      return this.dto(consumer)
    })
    app.put("/api/selections/:consumer/rules", request => {
      const consumer = this.consumer(request)
      this.selections.setRules(consumer, SelectionRulesUpdateSchema.parse(request.body))
      return this.dto(consumer)
    })
  }

  private consumer(request: FastifyRequest) {
    const { consumer } = z.object({ consumer: z.string().min(1) }).parse(request.params)
    if (!this.consumers(consumer)) throw HttpError.notFound(`selection "${consumer}"`)
    return consumer
  }

  private dto(consumer: string): SelectionDto {
    const { mode, rules } = this.selections.of(consumer)
    return { consumer, mode, rules: [...rules] }
  }
}
