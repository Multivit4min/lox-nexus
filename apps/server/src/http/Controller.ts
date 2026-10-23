import type { FastifyInstance } from "fastify"

/** A group of routes. Controllers are thin: they parse input, call a service and shape the response. */
export interface Controller {
  /** adds the group's routes; called once while the API plugin is assembled, after AuthGuard's hook is installed */
  register(app: FastifyInstance): void
}
