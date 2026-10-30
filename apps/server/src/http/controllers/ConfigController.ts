import { ConfigExportRequestSchema, ConfigExportSchema, ConfigImportRequestSchema, type ConfigExport } from "@lox-nexus/api"
import type { FastifyInstance, FastifyReply } from "fastify"
import type { ConfigTransfer } from "../../services/ConfigTransfer.ts"
import type { Controller } from "../Controller.ts"

/**
 * /api/config: the whole configuration as one JSON file. All routes need a session (401 otherwise).
 *
 * - GET /api/config/export: 200, as a download named lox-nexus-config-<date>.json; plugin
 *   instances without their secret settings.
 * - POST /api/config/export `{ passphrase }` (12 characters at least): the same with the plugins'
 *   secret settings, sealed with the passphrase.
 * - POST /api/config/import: the file, or `{ file, passphrase }` for one with sealed secrets
 *   (400 "passphrase-required" / "wrong-passphrase" otherwise). 200 with what was created.
 *   Replaces the current configuration, the plugin instances too when the file has them.
 *   400 for a file that isn't a valid export (nothing changes); 409 when a step fails (the
 *   previous configuration is restored) or another import is running; 500 when the restore was
 *   incomplete too. Forces and last values stay on topics that exist after it. While it runs,
 *   other changing API requests (but login, previews and project reads) get 503 with Retry-After.
 */
export class ConfigController implements Controller {
  /** exports of a few thousand signals exceed the default 1 MB body limit */
  static readonly IMPORT_BODY_LIMIT = 16 * 1_048_576

  constructor(private readonly transfer: ConfigTransfer) {}

  register(app: FastifyInstance) {
    app.get("/api/config/export", (_request, reply) => ConfigController.download(reply, this.transfer.export()))
    // a POST, so the passphrase never lands in a URL or a log
    app.post("/api/config/export", { config: { lockFree: true } }, async (request, reply) =>
      ConfigController.download(reply, await this.transfer.exportSealed(ConfigExportRequestSchema.parse(request.body).passphrase)))
    // lock-free here: the import takes the lock itself, so a second one gets its 409
    app.post("/api/config/import", { bodyLimit: ConfigController.IMPORT_BODY_LIMIT, config: { lockFree: true } }, request => {
      // a bare file first, so an invalid one gets its own precise error rather than a union's
      const body = request.body as Record<string, unknown> | null
      const { file, passphrase } = body && "format" in body ? { file: ConfigExportSchema.parse(body), passphrase: undefined } : ConfigImportRequestSchema.parse(body)
      return this.transfer.import(file, request.user!.username, passphrase)
    })
  }

  // no-store: it lists hosts and ports, and a cached copy would go stale
  private static download(reply: FastifyReply, doc: ConfigExport) {
    const date = doc.exportedAt?.slice(0, 10) ?? "export"
    return reply.header("content-disposition", `attachment; filename="lox-nexus-config-${date}.json"`).header("cache-control", "no-store").send(doc)
  }
}
