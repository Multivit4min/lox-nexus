import { AdoptPacketSchema, LoxoneSignalInputSchema, MiniserverInputSchema, ProjectReadSchema } from "@lox-nexus/api"
import { MiniserverFtp } from "@lox-nexus/loxone"
import type { FastifyInstance, FastifyRequest } from "fastify"
import { z } from "zod"
import type { LoxoneProjectService } from "../../services/LoxoneProjectService.ts"
import type { LoxoneSignalService } from "../../services/LoxoneSignalService.ts"
import type { MiniserverService } from "../../services/MiniserverService.ts"
import type { Controller } from "../Controller.ts"
import { HttpError } from "../HttpError.ts"

/** path parameter of every route that addresses one Miniserver */
const IdParams = z.object({ id: z.string().min(1) })
const SignalParams = IdParams.extend({ signalId: z.string().min(1) })
/** the uploaded file's name, for messages and the answer */
const FileQuery = z.object({ name: z.string().min(1).max(255).regex(/^[^\p{Cc}]+$/u, "must not contain control characters").default("project") })

/**
 * /api/miniservers: configs, start/stop, signals, and discovered packet ids. All routes need a
 * session (401 otherwise). Common answers: 400 invalid body or id, 404 unknown Miniserver or
 * signal, 409 domain conflict (taken slug, duplicate packet id).
 *
 * - GET list, GET :id: 200.
 * - POST /: 201 with the created Miniserver; a failed start is not an error, see `lastError`.
 * - PUT :id: 200 with the updated Miniserver.
 * - DELETE :id: 204, removes its signals, wires, forces and retained values too.
 * - GET unloadable: 200 with the stored Miniservers and signals that couldn't be loaded at boot;
 *   DELETE on their usual routes removes them.
 * - GET :id/load: 200 with the intercommunication load and the last hour of samples.
 * - GET :id/signal-load: 200 with each signal's share of that load, by signal id.
 * - POST :id/start, :id/stop: 200 with the Miniserver; start failures show up as `lastError`.
 * - GET/POST :id/signals, PUT/DELETE :id/signals/:signalId: 200 / 201 / 200 / 204. PUT keeps the
 *   signal's wires; its last value (flagged restored) and a force move to the new topic.
 * - GET :id/discovered: 200. POST :id/discovered/adopt: 201 with the new input signal, 404 for
 *   a packet id that was not seen.
 * - POST :id/project with an FTP login: 200 with the intercommunication part of the Miniserver's
 *   current Loxone Config project, 502 when it can't be read (unreachable, login refused, no project).
 * - POST :id/project/file?name=… with the raw bytes of a project file (`application/octet-stream`):
 *   the same answer from a `.Loxone`, `sps_….zip` or `.LoxCC`; 400 when it isn't one, 413 above 32 MB.
 */
export class MiniserverController implements Controller {
  /** the same cap as for a project downloaded from the Miniserver */
  static readonly PROJECT_FILE_LIMIT = MiniserverFtp.MAX_BYTES

  constructor(
    private readonly miniservers: MiniserverService,
    private readonly signals: LoxoneSignalService,
    private readonly projects: LoxoneProjectService
  ) {}

  register(app: FastifyInstance) {
    app.get("/api/miniservers", () => this.miniservers.list())
    app.get("/api/miniservers/unloadable", () => this.miniservers.unloadableRows())
    app.post("/api/miniservers", async (request, reply) => reply.code(201).send(await this.miniservers.create(MiniserverInputSchema.parse(request.body))))
    app.get("/api/miniservers/:id", request => this.miniservers.get(MiniserverController.id(request)))
    app.put("/api/miniservers/:id", request => this.miniservers.update(MiniserverController.id(request), MiniserverInputSchema.parse(request.body)))
    app.delete("/api/miniservers/:id", async (request, reply) => {
      await this.miniservers.remove(MiniserverController.id(request), request.user!.username)
      return reply.code(204).send()
    })
    app.get("/api/miniservers/:id/load", request => this.miniservers.intercomLoad(MiniserverController.id(request)))
    app.get("/api/miniservers/:id/signal-load", request => this.miniservers.signalLoad(MiniserverController.id(request)))
    app.post("/api/miniservers/:id/start", request => this.miniservers.start(MiniserverController.id(request)))
    app.post("/api/miniservers/:id/stop", request => this.miniservers.stop(MiniserverController.id(request)))
    app.post("/api/miniservers/:id/project", request => this.projects.read(MiniserverController.id(request), ProjectReadSchema.parse(request.body)))
    this.registerSignals(app)
    // in its own scope: only this route reads raw bytes, and only it accepts large bodies. Other
    // content types are refused (415) before their body is read, so no large JSON gets parsed.
    app.register(async scope => {
      const bodyLimit = MiniserverController.PROJECT_FILE_LIMIT
      scope.removeAllContentTypeParsers()
      scope.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit }, (_request, body, done) => done(null, body))
      scope.post("/api/miniservers/:id/project/file", { bodyLimit }, request => {
        if (!Buffer.isBuffer(request.body)) throw HttpError.badRequest("send the file as application/octet-stream")
        return this.projects.readFile(MiniserverController.id(request), FileQuery.parse(request.query).name, request.body)
      })
    })
  }

  private registerSignals(app: FastifyInstance) {
    app.get("/api/miniservers/:id/signals", request => this.signals.list(MiniserverController.id(request)))
    app.post("/api/miniservers/:id/signals", (request, reply) =>
      reply.code(201).send(this.signals.add(MiniserverController.id(request), LoxoneSignalInputSchema.parse(request.body))))
    app.put("/api/miniservers/:id/signals/:signalId", request => {
      const { id, signalId } = SignalParams.parse(request.params)
      return this.signals.update(id, signalId, LoxoneSignalInputSchema.parse(request.body), request.user!.username)
    })
    app.delete("/api/miniservers/:id/signals/:signalId", (request, reply) => {
      const { id, signalId } = SignalParams.parse(request.params)
      this.signals.remove(id, signalId, request.user!.username)
      return reply.code(204).send()
    })
    app.get("/api/miniservers/:id/discovered", request => this.signals.discovered(MiniserverController.id(request)))
    app.post("/api/miniservers/:id/discovered/adopt", (request, reply) =>
      reply.code(201).send(this.signals.adopt(MiniserverController.id(request), AdoptPacketSchema.parse(request.body), request.user!.username)))
  }

  private static id(request: FastifyRequest) {
    return IdParams.parse(request.params).id
  }
}
