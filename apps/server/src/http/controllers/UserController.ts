import { CreateUserInputSchema, DeleteUserInputSchema, SetUserPasswordInputSchema } from "@lox-nexus/api"
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { z } from "zod"
import type { LoginThrottle } from "../../auth/LoginThrottle.ts"
import type { UserService } from "../../services/UserService.ts"
import type { Controller } from "../Controller.ts"
import { HttpError } from "../HttpError.ts"

const IdParams = z.object({ id: z.string().min(1) })

/**
 * /api/users: the accounts. All routes need a session. Adding, deleting and setting someone's
 * password ask for the acting user's own password again and are throttled like logins (the same
 * counter: wrong passwords here count with wrong logins from the address).
 *
 * - GET /api/users: 200 with every account.
 * - POST /api/users `{ currentPassword, username, password }`: 201 with the account; 409 the name
 *   is taken.
 * - PUT /api/users/:id/password `{ currentPassword, password }`: 204; the user's sessions end.
 *   400 for your own account (use POST /api/auth/password).
 * - DELETE /api/users/:id `{ currentPassword }`: 204; 409 for yourself or the last account.
 * - All: 403 wrong own password, 404 unknown user, 429 throttled, 503 hasher busy.
 */
export class UserController implements Controller {
  constructor(private readonly users: UserService, private readonly throttle: LoginThrottle) {}

  register(app: FastifyInstance) {
    // accounts aren't configuration: a config import doesn't wait for them, nor they for it
    const lockFree = { config: { lockFree: true } }
    app.get("/api/users", request => this.users.list(UserController.actor(request)))
    app.post("/api/users", lockFree, async (request, reply) => {
      const { currentPassword, username, password } = CreateUserInputSchema.parse(request.body)
      const user = await this.reauthenticated(request, reply, actor => this.users.create(actor, currentPassword, username, password))
      return user && reply.code(201).send(user)
    })
    app.put("/api/users/:id/password", lockFree, async (request, reply) => {
      const { currentPassword, password } = SetUserPasswordInputSchema.parse(request.body)
      const id = IdParams.parse(request.params).id
      const done = await this.reauthenticated(request, reply, actor => this.users.setPassword(actor, currentPassword, id, password).then(() => true))
      return done && reply.code(204).send()
    })
    app.delete("/api/users/:id", lockFree, async (request, reply) => {
      const { currentPassword } = DeleteUserInputSchema.parse(request.body ?? {})
      const id = IdParams.parse(request.params).id
      const done = await this.reauthenticated(request, reply, actor => this.users.remove(actor, currentPassword, id).then(() => true))
      return done && reply.code(204).send()
    })
  }

  // counted before the hash like a login; a right password clears the address's counter
  private async reauthenticated<T>(request: FastifyRequest, reply: FastifyReply, work: (actor: string) => Promise<T>): Promise<T | undefined> {
    const wait = this.throttle.begin(request.ip)
    if (wait > 0) {
      reply.code(429).header("retry-after", Math.ceil(wait / 1000)).send({ error: "too many failed attempts, try again later" })
      return undefined
    }
    try {
      const result = await work(UserController.actor(request))
      this.throttle.succeeded(request.ip)
      return result
    } catch (error) {
      // only a wrong own password counts as a failed attempt
      if (!(error instanceof HttpError && error.status === 403)) this.throttle.succeeded(request.ip)
      throw error
    }
  }

  private static actor(request: FastifyRequest) {
    return request.user!.id
  }
}
