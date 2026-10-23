import type { FastifyInstance } from "fastify"

/** A group of routes. Controllers are thin: they parse input, call a service and shape the response. */
export interface Controller {
  register(app: FastifyInstance): void
}
