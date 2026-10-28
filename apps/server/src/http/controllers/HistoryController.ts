import type { FastifyInstance } from "fastify"
import { z } from "zod"
import type { HistoryService } from "../../history/HistoryService.ts"
import type { HistorySettingsStore } from "../../history/HistorySettingsStore.ts"
import type { Controller } from "../Controller.ts"

const SignalParams = z.object({ signalId: z.string().min(1) })

/**
 * /api/history: the value history. All routes need a session.
 * - GET /api/history/signals/:signalId?from&to&points: 200 with the series (resolution chosen by
 *   the server); 400 for an invalid range; 404 for an unknown signal without history.
 * - DELETE /api/history/signals/:signalId: 204, all stored history of the signal is gone.
 * - GET /api/history/recorded: 200 with the ids of the signals the selection takes (also while recording is off).
 * - GET /api/history/stats: 200 with size, the last hour's rows and the projected size.
 * - GET/PUT /api/history/settings: 200 with the settings; PUT keeps fields it doesn't name; 400 for invalid ones.
 */
export class HistoryController implements Controller {
  constructor(private readonly history: HistoryService, private readonly settings: HistorySettingsStore) {}

  register(app: FastifyInstance) {
    app.get("/api/history/signals/:signalId", request => this.history.series(SignalParams.parse(request.params).signalId, request.query))
    app.delete("/api/history/signals/:signalId", async (request, reply) => {
      await this.history.purge(SignalParams.parse(request.params).signalId)
      return reply.code(204).send()
    })
    app.get("/api/history/recorded", () => this.history.recorded())
    app.get("/api/history/stats", () => this.history.stats())
    app.get("/api/history/settings", () => this.settings.current)
    app.put("/api/history/settings", request => this.settings.update(z.record(z.string(), z.unknown()).parse(request.body)))
  }
}
