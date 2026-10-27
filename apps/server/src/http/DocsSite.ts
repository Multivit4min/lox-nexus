import fs from "node:fs"
import path from "node:path"
import fastifyStatic from "@fastify/static"
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"

/**
 * Serves the documentation site (apps/docs, built with relative links only) at /docs/, without a
 * login: it holds nothing secret and helps before the first login. Like the web UI, the build
 * may appear after boot, so its presence is checked per request. Without a configured directory,
 * /docs answers with how to enable it, rather than falling through to the web UI.
 */
export class DocsSite {
  static readonly PREFIX = "/docs/"

  constructor(private readonly dir: string | undefined) {}

  register(app: FastifyInstance) {
    // relative, so it also works behind a proxy that serves Nexus under a prefix
    app.get("/docs", (_request, reply) => reply.redirect("docs/", 301))
    const dir = this.dir
    if (!dir) {
      const disabled = (_request: FastifyRequest, reply: FastifyReply) => reply.code(404).type("text/plain; charset=utf-8")
        .send("The documentation isn't served by this Nexus. Build it with npm run docs:build and set NEXUS_DOCS_DIR to apps/docs/dist.")
      app.get(DocsSite.PREFIX, disabled)
      app.get(`${DocsSite.PREFIX}*`, disabled)
      return
    }
    // only the root gets its index: a directory URL without its slash would load with a base one
    // level off (unstyled, every link wrong), so directories fall through to the 404 page instead
    app.get(DocsSite.PREFIX, (request, reply) => this.send(reply, "index.html", 200) ?? this.notFound(request, reply))
    // the web UI's registration already decorates reply.sendFile; a second one must not
    app.register(fastifyStatic, {
      root: dir, prefix: DocsSite.PREFIX, decorateReply: false, index: false, redirect: false,
      // files only (the build has no others): directories and dotfiles get the 404 page
      allowedPath: pathName => DocsSite.isFile(pathName)
    })
  }

  /** whether a not-found request belongs to the docs (and gets their 404 page) */
  handles(request: FastifyRequest) {
    return this.dir !== undefined && (request.method === "GET" || request.method === "HEAD") && request.url.startsWith(DocsSite.PREFIX)
  }

  /** the site's own 404 page for unknown paths below /docs/ */
  notFound(request: FastifyRequest, reply: FastifyReply) {
    // the page's links are relative to the site root; a base tag makes them work at any depth
    const depth = request.url.split("?")[0]!.slice(DocsSite.PREFIX.length).split("/").length - 1
    const base = `<base href="${"../".repeat(depth) || "./"}">`
    return this.send(reply, "404.html", 404, html => html.replace("<head>", `<head>${base}`))
      ?? reply.code(503).send({ error: "docs not built yet: run npm run docs:build" })
  }

  /** a path whose segments don't start with a dot and whose last one has an extension */
  static isFile(pathName: string) {
    const segments = pathName.split("/").filter(Boolean)
    return segments.length > 0 && segments.every(segment => !segment.startsWith(".")) && segments.at(-1)!.includes(".")
  }

  /** undefined when the file isn't there (not built yet) */
  private send(reply: FastifyReply, file: string, status: number, transform = (html: string) => html) {
    const page = path.join(this.dir!, file)
    if (!fs.existsSync(page)) return undefined
    return reply.code(status).type("text/html; charset=utf-8").send(transform(fs.readFileSync(page, "utf8")))
  }
}
