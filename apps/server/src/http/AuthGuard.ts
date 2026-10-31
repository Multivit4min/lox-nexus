import type { FastifyReply, FastifyRequest } from "fastify"
import type { AccessContext, AccessTokenService } from "../auth/AccessTokenService.ts"
import type { AuthService, AuthUser } from "../auth/AuthService.ts"
import type { LoginThrottle } from "../auth/LoginThrottle.ts"
import type { SessionCookie } from "./SessionCookie.ts"

declare module "fastify" {
  interface FastifyRequest {
    /** the logged-in user; set by AuthGuard for every API request with a valid session (or, on a `tokenAuth` route, token) */
    user: AuthUser | undefined
    /** the access token's scopes on a `tokenAuth` route; undefined everywhere else */
    access: AccessContext | undefined
  }
  interface FastifyContextConfig {
    /** reachable without a session (login, setup, health) */
    public?: boolean
    /** a POST that changes no configuration (login, a preview), so a config import doesn't hold it off (ChangeLock) */
    lockFree?: boolean
    /**
     * authenticated by an access token (`Authorization: Bearer`) instead of the session cookie,
     * which it ignores (/mcp). Every other route ignores bearer headers, so a token is never a
     * general API key, and a browser session can't drive a token route.
     */
    tokenAuth?: boolean
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

  /**
   * @param publicOrigins origins the UI is served from behind a proxy that rewrites Host, e.g. https://nexus.example
   * @param tokens access tokens for `tokenAuth` routes, with a throttle of their own for wrong ones
   */
  constructor(
    private readonly auth: AuthService,
    private readonly cookie: SessionCookie,
    publicOrigins: readonly string[] = [],
    private readonly tokens?: { service: Pick<AccessTokenService, "authenticate">; throttle: LoginThrottle }
  ) {
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
    request.access = undefined
    if (request.routeOptions.config.tokenAuth) return this.checkToken(request, reply)
    const token = this.cookie.read(request)
    const session = token ? this.auth.authenticate(token) : undefined
    request.user = session?.user
    // the cookie's Max-Age must slide with the session, or the browser drops it 30 days after login
    if (token && session?.renewed) this.cookie.set(reply, token)
    if (!request.user && !request.routeOptions.config.public) return reply.code(401).send({ error: "login required" })
  }

  // a token route: the bearer header only, never the cookie. A valid token always gets in: an
  // agent still retrying with a token ended by a password change mustn't lock its replacement out.
  // Only wrong tokens count against the address (looking one up costs a hash, and 256-bit tokens
  // can't be guessed, so this is about noise, not brute force)
  private checkToken(request: FastifyRequest, reply: FastifyReply) {
    request.user = undefined
    // a token in the URL ends up in proxy and server logs
    if (AuthGuard.tokenInUrl(request)) return reply.code(400).send({ error: "send the token in the Authorization header, not in the URL" })
    const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.authorization ?? "")?.[1]
    if (!bearer || !this.tokens) return reply.code(401).header("www-authenticate", "Bearer").send({ error: "an access token is required (Authorization: Bearer …)" })
    const found = this.tokens.service.authenticate(bearer)
    if (found) {
      request.user = found.user
      request.access = found.access
      return undefined
    }
    const wait = this.tokens.throttle.begin(request.ip)
    if (wait > 0) return reply.code(429).header("retry-after", Math.ceil(wait / 1000)).send({ error: "too many wrong tokens, try again later" })
    return reply.code(401).header("www-authenticate", "Bearer error=\"invalid_token\"").send({ error: "unknown or revoked access token" })
  }

  // a key that names a token, or any value that is one (nxp_…)
  private static tokenInUrl(request: FastifyRequest) {
    const query = (request.query ?? {}) as Record<string, unknown>
    return Object.entries(query).some(([key, value]) => /token|auth|^nxp_/i.test(key) || (typeof value === "string" && value.startsWith("nxp_")))
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
