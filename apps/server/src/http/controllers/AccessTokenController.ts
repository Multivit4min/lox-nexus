import { CreateAccessTokenInputSchema, type CreatedAccessTokenDto } from "@lox-nexus/api"
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { z } from "zod"
import type { AccessTokenService } from "../../auth/AccessTokenService.ts"
import type { LoginThrottle } from "../../auth/LoginThrottle.ts"
import { TooManyTokensError } from "../../auth/TooManyTokensError.ts"
import type { PasswordHasher } from "../../auth/PasswordHasher.ts"
import type { UserRepository } from "../../db/repositories/UserRepository.ts"
import type { Controller } from "../Controller.ts"
import { HttpError } from "../HttpError.ts"

const IdParams = z.object({ id: z.string().min(1) })

/**
 * /api/tokens: your own access tokens for MCP. Session only: a token can't list or make tokens
 * (AuthGuard ignores bearer headers here).
 *
 * - GET /api/tokens: 200 with your tokens, newest first; never the tokens themselves.
 * - POST /api/tokens `{ currentPassword, name, scopes }`: 201 with the token, shown this once.
 *   Asks for your password again, throttled like logins; 403 wrong password, 409 at the limit.
 * - DELETE /api/tokens/:id: 204, at once; 404 when it isn't yours.
 */
export class AccessTokenController implements Controller {
  constructor(
    private readonly tokens: Pick<AccessTokenService, "list" | "create" | "revoke">,
    private readonly users: Pick<UserRepository, "findById">,
    private readonly hasher: Pick<PasswordHasher, "verify">,
    private readonly throttle: LoginThrottle,
    private readonly log: (message: string) => void = () => {}
  ) {}

  register(app: FastifyInstance) {
    // tokens aren't configuration: a config import doesn't wait for them
    const lockFree = { config: { lockFree: true } }
    app.get("/api/tokens", request => this.tokens.list(AccessTokenController.user(request).id))
    app.post("/api/tokens", lockFree, (request, reply) => this.create(request, reply))
    app.delete("/api/tokens/:id", lockFree, (request, reply) => {
      const user = AccessTokenController.user(request)
      const id = IdParams.parse(request.params).id
      if (!this.tokens.revoke(user.id, id)) throw HttpError.notFound(`access token "${id}"`)
      this.log(`access token ${id} of ${user.username} revoked`)
      return reply.code(204).send()
    })
  }

  private async create(request: FastifyRequest, reply: FastifyReply) {
    const { currentPassword, name, scopes } = CreateAccessTokenInputSchema.parse(request.body)
    const user = AccessTokenController.user(request)
    const wait = this.throttle.begin(request.ip)
    if (wait > 0) return reply.code(429).header("retry-after", Math.ceil(wait / 1000)).send({ error: "too many failed attempts, try again later" })
    const row = this.users.findById(user.id)
    if (!row || !(await this.hasher.verify(currentPassword, row.password_hash))) throw new HttpError(403, "your password is wrong")
    this.throttle.succeeded(request.ip)
    try {
      const created: CreatedAccessTokenDto | undefined = this.tokens.create(user.id, name, scopes, row.password_hash)
      if (!created) throw new HttpError(403, "your password changed meanwhile; try again with the new one")
      this.log(`access token "${name}" (${created.accessToken.scopes.join(", ")}) created by ${user.username}`)
      return reply.code(201).send(created)
    } catch (error) {
      if (error instanceof TooManyTokensError) throw HttpError.conflict(error.message)
      throw error
    }
  }

  private static user(request: FastifyRequest) {
    return request.user!
  }
}
