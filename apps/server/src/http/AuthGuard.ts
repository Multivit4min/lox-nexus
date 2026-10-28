import type { FastifyReply, FastifyRequest } from "fastify"
import type { AuthService, AuthUser } from "../auth/AuthService.ts"
import type { SessionCookie } from "./SessionCookie.ts"

declare module "fastify" {
  interface FastifyRequest {
    /** the logged-in user; set by AuthGuard for every API request with a valid session */
    user: AuthUser | undefined
  }
  interface FastifyContextConfig {
    /** reachable without a session (login, setup, health) */
    public?: boolean
    /** a POST that changes no configuration (login, a preview), so a config import doesn't hold it off (ChangeLock) */
    lockFree?: boolean
  }
}

/**
 * Resolves the session cookie on every API request (including the WebSocket upgrade) and rejects
 * non-public routes without a valid session. It is registered as a hook of the API plugin, so it
 * runs for every route in it, however the URL is spelled (never check request.url: the router
 * decodes it, the raw string doesn't, and "/%61pi" would slip past).
 *
 * State-changing requests and upgrades whose Origin is neither the Host nor a configured public
 * origin are refused, as a second line of defence after SameSite=Strict.
 */
export class AuthGuard {
  private static readonly SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])
  private readonly allowedOrigins: Set<string>

  /** @param publicOrigins origins the UI is served from behind a proxy that rewrites Host, e.g. https://nexus.example */
  constructor(private readonly auth: AuthService, private readonly cookie: SessionCookie, publicOrigins: readonly string[] = []) {
    this.allowedOrigins = new Set(publicOrigins.map(origin => new URL(origin).origin))
  }

  /**
   * The onRequest hook. Order matters: the Origin check comes before the session lookup, so a
   * cross-site request is refused even when the browser attached a valid cookie.
   * Answers 403 for a cross-origin state-changing request or WebSocket upgrade, 401 when a
   * non-public route has no valid session; otherwise it only sets request.user.
   */
  readonly check = async (request: FastifyRequest, reply: FastifyReply) => {
    if (this.isCrossOrigin(request)) return reply.code(403).send({ error: "cross-origin request refused" })
    const token = this.cookie.read(request)
    const session = token ? this.auth.authenticate(token) : undefined
    request.user = session?.user
    // the cookie's Max-Age must slide with the session, or the browser drops it 30 days after login
    if (token && session?.renewed) this.cookie.set(reply, token)
    if (!request.user && !request.routeOptions.config.public) return reply.code(401).send({ error: "login required" })
  }

  // Requests without an Origin header (curl, server-to-server) pass: they carry no browser cookie
  // jar to abuse. An unparsable Origin counts as cross-origin. WebSocket upgrades are GETs but
  // browsers don't apply CORS to them, so they are checked like writes.
  private isCrossOrigin(request: FastifyRequest) {
    const upgrade = request.headers.upgrade?.toLowerCase() === "websocket"
    if (AuthGuard.SAFE_METHODS.has(request.method) && !upgrade) return false
    const origin = request.headers.origin
    if (!origin) return false
    try {
      const url = new URL(origin)
      return url.host !== request.headers.host && !this.allowedOrigins.has(url.origin)
    } catch {
      return true
    }
  }
}
