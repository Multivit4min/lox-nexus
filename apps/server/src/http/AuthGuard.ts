import type { FastifyReply, FastifyRequest } from "fastify"
import type { AuthService, AuthUser } from "../auth/AuthService.ts"
import type { SessionCookie } from "./SessionCookie.ts"

declare module "fastify" {
  interface FastifyRequest {
    /** the logged-in user; set by AuthGuard for every /api request with a valid session */
    user: AuthUser | undefined
  }
  interface FastifyContextConfig {
    /** reachable without a session (login, setup, health) */
    public?: boolean
  }
}

/**
 * Resolves the session cookie on every /api request (including the WebSocket upgrade) and
 * rejects requests to non-public routes without a valid session. State-changing requests and
 * upgrades with an Origin header from another host are refused as a second line of defence
 * after SameSite=Strict.
 */
export class AuthGuard {
  private static readonly SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

  constructor(private readonly auth: AuthService, private readonly cookie: SessionCookie) {}

  /** the onRequest hook */
  readonly check = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.url.startsWith("/api/")) return
    if (this.isCrossOrigin(request)) return reply.code(403).send({ error: "cross-origin request refused" })
    const token = this.cookie.read(request)
    request.user = token ? this.auth.authenticate(token) : undefined
    if (!request.user && !request.routeOptions.config.public) return reply.code(401).send({ error: "login required" })
  }

  private isCrossOrigin(request: FastifyRequest) {
    const upgrade = request.headers.upgrade?.toLowerCase() === "websocket"
    if (AuthGuard.SAFE_METHODS.has(request.method) && !upgrade) return false
    const origin = request.headers.origin
    if (!origin) return false
    try {
      return new URL(origin).host !== request.headers.host
    } catch {
      return true
    }
  }
}
