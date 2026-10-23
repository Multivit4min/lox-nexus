import { ChangePasswordSchema, CredentialsSchema, type AuthStateDto } from "@lox-nexus/api"
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import type { AuthService } from "../../auth/AuthService.ts"
import type { LoginThrottle } from "../../auth/LoginThrottle.ts"
import type { Controller } from "../Controller.ts"
import type { SessionCookie } from "../SessionCookie.ts"

/** /api/auth: who am I, first-run setup, login, logout and password change. */
export class AuthController implements Controller {
  constructor(private readonly auth: AuthService, private readonly throttle: LoginThrottle, private readonly cookie: SessionCookie) {}

  register(app: FastifyInstance) {
    const open = { config: { public: true } }
    app.get("/api/auth", open, (request): AuthStateDto => this.state(request))
    app.post("/api/auth/setup", open, (request, reply) => this.setup(request, reply))
    app.post("/api/auth/login", open, (request, reply) => this.login(request, reply))
    app.post("/api/auth/logout", open, (request, reply) => this.logout(request, reply))
    app.post("/api/auth/password", (request, reply) => this.changePassword(request, reply))
  }

  private state(request: FastifyRequest): AuthStateDto {
    return { setupRequired: this.auth.needsSetup(), ...(request.user ? { user: request.user } : {}) }
  }

  // throttled like login: every request to it costs a password hash
  private async setup(request: FastifyRequest, reply: FastifyReply) {
    const { username, password } = CredentialsSchema.parse(request.body)
    if (this.throttled(request, reply)) return reply
    const { user, token } = await this.auth.setup(username, password)
    this.throttle.succeeded(request.ip)
    this.cookie.set(reply, token)
    return { setupRequired: false, user } satisfies AuthStateDto
  }

  // the response never says whether the user exists
  private async login(request: FastifyRequest, reply: FastifyReply) {
    const { username, password } = CredentialsSchema.parse(request.body)
    if (this.throttled(request, reply)) return reply
    const result = await this.auth.login(username, password)
    if (!result) return reply.code(401).send({ error: "wrong username or password" })
    this.throttle.succeeded(request.ip)
    this.cookie.set(reply, result.token)
    return { setupRequired: false, user: result.user } satisfies AuthStateDto
  }

  /** counts the attempt before the slow hash, so parallel requests can't slip past; true when refused */
  private throttled(request: FastifyRequest, reply: FastifyReply) {
    const wait = this.throttle.begin(request.ip)
    if (wait <= 0) return false
    reply.code(429).header("retry-after", Math.ceil(wait / 1000)).send({ error: "too many failed attempts, try again later" })
    return true
  }

  private logout(request: FastifyRequest, reply: FastifyReply) {
    const token = this.cookie.read(request)
    if (token) this.auth.logout(token)
    this.cookie.clear(reply)
    return reply.code(204).send()
  }

  private async changePassword(request: FastifyRequest, reply: FastifyReply) {
    const { current, next } = ChangePasswordSchema.parse(request.body)
    const token = await this.auth.changePassword(request.user!.id, current, next)
    if (!token) return reply.code(400).send({ error: "the current password is wrong" })
    this.cookie.set(reply, token)
    return reply.code(204).send()
  }
}
