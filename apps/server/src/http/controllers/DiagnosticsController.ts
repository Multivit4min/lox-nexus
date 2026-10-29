import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { DiagnosticsCsv } from "../../diagnostics/DiagnosticsCsv.ts"
import type { DiagnosticsSampler } from "../../diagnostics/DiagnosticsSampler.ts"
import type { Controller } from "../Controller.ts"

const SinceQuery = z.object({ since: z.coerce.number().finite().optional() })

/**
 * GET /api/diagnostics (`?since=<epoch ms>` for only newer samples) and its samples as CSV, for the System page; behind the login like the rest
 * of the API.
 */
export class DiagnosticsController implements Controller {
  constructor(private readonly sampler: Pick<DiagnosticsSampler, "snapshot">) {}

  register(app: FastifyInstance) {
    app.get("/api/diagnostics", request => this.sampler.snapshot(SinceQuery.parse(request.query).since))
    app.get("/api/diagnostics/samples.csv", (_request, reply) => {
      const name = `nexus-diagnostics-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`
      return reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", `attachment; filename="${name}"`)
        .send(new DiagnosticsCsv().write(this.sampler.snapshot().samples))
    })
  }
}
