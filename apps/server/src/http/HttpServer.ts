import fs from "node:fs"
import path from "node:path"
import fastifyCookie from "@fastify/cookie"
import fastifyStatic from "@fastify/static"
import fastifyWebsocket from "@fastify/websocket"
import { Disposable } from "@lox-nexus/plugin-sdk"
import Fastify, { LogController, type FastifyBaseLogger, type FastifyInstance } from "fastify"
import type { AuthGuard } from "./AuthGuard.ts"
import type { Controller } from "./Controller.ts"
import { ErrorHandler } from "./ErrorHandler.ts"

export interface HttpServerOptions {
  /** a pino logger; typed as Fastify's base logger so the app keeps its default type parameters */
  logger: FastifyBaseLogger
  guard: AuthGuard
  controllers: Controller[]
  /** built web UI; served with a fallback to index.html for client-side routes */
  webDir?: string
  /** proxies whose X-Forwarded-For sets request.ip; empty trusts nobody */
  trustProxy?: string[]
}

/** The Fastify app: cookies, WebSocket, the auth guard, controllers and the static UI. */
export class HttpServer extends Disposable {
  readonly app: FastifyInstance

  constructor(options: HttpServerOptions) {
    super()
    // one megabyte is plenty for JSON configs; larger bodies are refused before parsing
    this.app = Fastify({
      loggerInstance: options.logger,
      bodyLimit: 1_048_576,
      trustProxy: options.trustProxy?.length ? options.trustProxy : false,
      // per-request logs would drown the bus events; errors are still logged by ErrorHandler
      logController: new LogController({ disableRequestLogging: true })
    })
    this.app.decorateRequest("user", undefined)
    this.app.setErrorHandler(new ErrorHandler().handle)
    this.app.register(fastifyCookie)
    this.app.register(fastifyWebsocket, { options: { maxPayload: 65_536 } })
    this.app.register(async app => {
      app.addHook("onRequest", options.guard.check)
      app.get("/api/health", { config: { public: true } }, () => ({ ok: true }))
      for (const controller of options.controllers) controller.register(app)
    })
    this.serveWeb(options.webDir)
    this.onDispose(() => this.app.close())
  }

  /** resolves once all plugins and routes are registered; needed before inject() in tests */
  ready() {
    return this.app.ready()
  }

  /** @returns the address it listens on, e.g. http://127.0.0.1:8080 */
  start(port: number, host: string) {
    return this.app.listen({ port, host })
  }

  private serveWeb(webDir: string | undefined) {
    const index = webDir && path.join(webDir, "index.html")
    if (!webDir || !index || !fs.existsSync(index)) {
      this.app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: "not found" }))
      return
    }
    this.app.register(fastifyStatic, { root: webDir, wildcard: false })
    this.app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/") || request.method !== "GET") return reply.code(404).send({ error: "not found" })
      return reply.sendFile("index.html")
    })
  }
}
