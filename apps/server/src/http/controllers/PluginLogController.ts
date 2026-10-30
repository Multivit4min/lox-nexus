import { PluginLogLevelInputSchema, type PluginLogLineDto } from "@lox-nexus/api"
import type { FastifyInstance, FastifyRequest } from "fastify"
import { z } from "zod"
import type { PluginLogs } from "../../services/PluginLogs.ts"
import type { PluginService } from "../../services/PluginService.ts"
import type { Controller } from "../Controller.ts"

const IdParams = z.object({ id: z.string().min(1) })
const LogsQuery = z.object({ download: z.literal("1").optional() })

/**
 * An instance's log lines and whether it keeps debug lines. All routes need a session and answer
 * 404 for an unknown instance. None changes the configuration, so a config import doesn't wait.
 *
 * - GET /api/plugin-instances/:id/logs: 200 with the recent lines, oldest first (kept in memory
 *   only); with `?download=1` as a text file, one line each.
 * - GET :id/log-level: 200 `{ level, until? }`.
 * - PUT :id/log-level `{ level, minutes? }`: 200 as GET. Debug lasts `minutes` (1-60, default
 *   15) from now, then ends by itself; "info" ends it at once.
 */
export class PluginLogController implements Controller {
  constructor(private readonly plugins: Pick<PluginService, "get">, private readonly logs: Pick<PluginLogs, "recent" | "levelOf" | "setLevel">) {}

  register(app: FastifyInstance) {
    const lockFree = { config: { lockFree: true } }
    app.get("/api/plugin-instances/:id/logs", (request, reply) => {
      const id = this.id(request)
      const lines = this.logs.recent(id)
      if (!LogsQuery.parse(request.query).download) return lines
      const slug = this.plugins.get(id).slug
      return reply.type("text/plain; charset=utf-8").header("content-disposition", `attachment; filename="${slug}-log.txt"`).send(PluginLogController.text(lines))
    })
    app.get("/api/plugin-instances/:id/log-level", request => this.logs.levelOf(this.id(request)))
    app.put("/api/plugin-instances/:id/log-level", lockFree, request => {
      const id = this.id(request)
      const { level, minutes } = PluginLogLevelInputSchema.parse(request.body)
      return this.logs.setLevel(id, level, minutes)
    })
  }

  // checks that the instance exists: its log is empty, not missing, but an unknown id is a mistake
  private id(request: FastifyRequest) {
    const { id } = IdParams.parse(request.params)
    this.plugins.get(id)
    return id
  }

  private static text(lines: PluginLogLineDto[]) {
    return lines.map(line => `${new Date(line.ts).toISOString()} ${line.level.toUpperCase().padEnd(5)} ${line.message}${line.data ? ` ${line.data}` : ""}\n`).join("")
  }
}
