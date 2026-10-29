import { ActivateInputSchema, ConfirmInstallInputSchema, GitInstallInputSchema, LocalInstallInputSchema } from "@lox-nexus/api"
import type { FastifyInstance } from "fastify"
import { z } from "zod"
import type { PluginPackageService } from "../../services/PluginPackageService.ts"
import type { Controller } from "../Controller.ts"
import { HttpError } from "../HttpError.ts"

const IdParams = z.object({ id: z.string().min(1).max(64) })
const StagingParams = z.object({ stagingId: z.uuid() })
const VersionParams = IdParams.extend({ version: z.string().min(1).max(64) })
const ZipQuery = z.object({ name: z.string().min(1).max(255).regex(/^[^\p{Cc}]+$/u, "must not contain control characters").default("plugin.zip") })

/**
 * /api/plugin-packages: installing plugins (M5e). All routes need a session; every user is an
 * admin in v1. Installs run in two steps, stage then confirm, so the user reviews what was
 * fetched before it is installed. Staging already runs the plugin's code once (to describe it).
 *
 * - GET /api/plugin-packages: 200 with the installed plugins.
 * - GET /api/plugin-packages/repository: 200 with the plugins in the server's local repository.
 * - GET /api/plugin-packages/:id/readme: 200 with { markdown } of the version in use; 404 without one.
 * - POST …/stage/git `{ url, ref }`, …/stage/local `{ folder }`, …/stage/zip?name= (the archive as
 *   application/zip, x-zip-compressed or octet-stream, up to 50 MiB): 201 with the staged install.
 * - POST …/stage/:stagingId/confirm `{ expectedActive }`: 200 with the plugin and its instances.
 * - DELETE …/stage/:stagingId: 204.
 * - POST …/:id/activate `{ version, expectedActive }`: 200 with the plugin and its instances; switches
 *   to the stored previous version (rollback) or back.
 * - GET …/:id/versions/:version/impact: 200 with what switching to that stored version would do.
 * - DELETE …/:id: 204, or 409 while instances of the plugin exist.
 *
 * Errors: 400 unusable source or package, or the plugin failed to load; 404 unknown or expired;
 * 409 busy, version installed with another bundle, changed meanwhile, or in use; 413 archive too
 * large; 502 git failed; 504 git timed out; 507 disk full.
 */
export class PluginPackageController implements Controller {
  /** what browsers and tools send for a .zip; Windows labels it x-zip-compressed */
  private static readonly ZIP_TYPES = ["application/zip", "application/x-zip-compressed", "application/octet-stream"]

  constructor(private readonly packages: PluginPackageService) {}

  register(app: FastifyInstance) {
    app.get("/api/plugin-packages", () => this.packages.list())
    app.get("/api/plugin-packages/repository", () => this.packages.repository())
    app.get("/api/plugin-packages/:id/readme", (request, reply) => {
      const markdown = this.packages.readme((request.params as { id: string }).id)
      return markdown === undefined ? reply.code(404).send({ error: "this plugin has no README" }) : { markdown }
    })
    app.post("/api/plugin-packages/stage/git", async (request, reply) =>
      reply.code(201).send(await this.packages.stageGit(GitInstallInputSchema.parse(request.body), request.user!.username)))
    app.post("/api/plugin-packages/stage/local", async (request, reply) =>
      reply.code(201).send(await this.packages.stageLocal(LocalInstallInputSchema.parse(request.body).folder, request.user!.username)))
    app.post("/api/plugin-packages/stage/:stagingId/confirm", request => {
      const { stagingId } = StagingParams.parse(request.params)
      return this.packages.confirm(stagingId, ConfirmInstallInputSchema.parse(request.body).expectedActive, request.user!.username)
    })
    app.delete("/api/plugin-packages/stage/:stagingId", async (request, reply) => {
      await this.packages.discard(StagingParams.parse(request.params).stagingId, request.user!.username)
      return reply.code(204).send()
    })
    app.post("/api/plugin-packages/:id/activate", request =>
      this.packages.activate(IdParams.parse(request.params).id, ActivateInputSchema.parse(request.body), request.user!.username))
    app.get("/api/plugin-packages/:id/versions/:version/impact", request => {
      const { id, version } = VersionParams.parse(request.params)
      return this.packages.impact(id, version)
    })
    app.delete("/api/plugin-packages/:id", async (request, reply) => {
      await this.packages.uninstall(IdParams.parse(request.params).id, request.user!.username)
      return reply.code(204).send()
    })
    this.registerUpload(app)
  }

  // in its own scope: only this route reads raw bytes and accepts large bodies; other content
  // types are refused (415) before their body is read
  private registerUpload(app: FastifyInstance) {
    app.register(async scope => {
      const bodyLimit = this.packages.uploadBytes
      scope.removeAllContentTypeParsers()
      scope.addContentTypeParser(PluginPackageController.ZIP_TYPES, { parseAs: "buffer", bodyLimit }, (_request, body, done) => done(null, body))
      scope.post("/api/plugin-packages/stage/zip", { bodyLimit }, async (request, reply) => {
        if (!Buffer.isBuffer(request.body)) throw HttpError.badRequest("send the archive as application/zip")
        return reply.code(201).send(await this.packages.stageZip(request.body, ZipQuery.parse(request.query).name, request.user!.username))
      })
    })
  }
}
