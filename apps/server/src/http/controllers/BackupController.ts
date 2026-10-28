import type { RestoreApplyDto, RestoreStatusDto } from "@lox-nexus/api"
import type { FastifyInstance } from "fastify"
import { Readable as ReadableBase } from "node:stream"
import { z } from "zod"
import type { BackupService } from "../../backup/BackupService.ts"
import type { RestoreService } from "../../backup/RestoreService.ts"
import { HttpError } from "../HttpError.ts"
import type { Controller } from "../Controller.ts"

const CreateBody = z.object({
  passphrase: z.string().max(1000),
  /** a checkbox of a plain form sends "on" */
  history: z.union([z.boolean(), z.enum(["on", "true", "false"])]).optional().transform(value => value === true || value === "on" || value === "true")
})

/**
 * /api/backup: the whole installation as one encrypted file, and restoring one. All routes need a
 * session; a backup holds everything, secrets included, encrypted with the passphrase.
 * - POST /api/backup with `passphrase` and `history` (JSON or a plain form, so the browser saves the
 *   download as it arrives): 200 with the file; 400 for a passphrase under 8 characters; 409 while
 *   another backup is made.
 * - POST /api/backup/restore with the file's bytes (`application/octet-stream`) and the passphrase,
 *   URI-encoded, in `x-backup-passphrase`: 200 with what is now pending; 400 for a wrong
 *   passphrase, a damaged file or one from a newer Nexus. Nothing changes until it is applied.
 * - GET /api/backup/restore: 200 RestoreStatusDto. DELETE: 204, the checked backup is discarded
 *   (409 during an upload).
 * - POST /api/backup/restore/apply: marks the checked backup for the next start; 202 when Nexus
 *   restarts itself now, 200 with `restarting: false` when it must be restarted by hand; 404
 *   without a checked backup; 409 during an upload or a restart.
 */
export class BackupController implements Controller {
  private restarting = false

  constructor(private readonly backups: BackupService, private readonly restores: RestoreService, private readonly restart: (() => void) | undefined) {}

  register(app: FastifyInstance) {
    app.register(async scope => {
      scope.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string", bodyLimit: 16_384 }, (_request, body, done) =>
        done(null, Object.fromEntries(new URLSearchParams(String(body)))))
      scope.post("/api/backup", async (request, reply) => {
        const { passphrase, history } = CreateBody.parse(request.body)
        const { stream, filename } = await this.backups.create(passphrase, history)
        return reply.header("content-type", "application/octet-stream").header("content-disposition", `attachment; filename="${filename}"`).send(stream)
      })
    })
    // raw bytes, any size, read as they arrive; other content types are refused (415)
    app.register(async scope => {
      scope.removeAllContentTypeParsers()
      scope.addContentTypeParser("application/octet-stream", (_request, payload, done) => done(null, payload))
      scope.post("/api/backup/restore", async request => {
        const header = request.headers["x-backup-passphrase"]
        if (typeof header !== "string") throw HttpError.badRequest("the passphrase is missing")
        if (!(request.body instanceof ReadableBase)) throw HttpError.badRequest("send the file as application/octet-stream")
        return this.restores.stage(request.body, BackupController.decode(header))
      })
    })
    app.get("/api/backup/restore", async (): Promise<RestoreStatusDto> => {
      const pending = await this.restores.pending()
      return { pending: pending ?? null, canRestart: this.restart !== undefined }
    })
    app.delete("/api/backup/restore", async (_request, reply) => {
      await this.restores.discard()
      return reply.code(204).send()
    })
    app.post("/api/backup/restore/apply", async (_request, reply): Promise<RestoreApplyDto> => {
      if (this.restarting) throw HttpError.conflict("Nexus is restarting already")
      await this.restores.markForApply()
      const restart = this.restart
      if (!restart) return { restarting: false }
      // answered first; the restart closes this server
      this.restarting = true
      reply.raw.once("finish", () => setImmediate(restart))
      reply.code(202)
      return { restarting: true }
    })
  }

  private static decode(header: string) {
    try {
      return decodeURIComponent(header)
    } catch {
      throw HttpError.badRequest("the passphrase header is not URI-encoded")
    }
  }
}
