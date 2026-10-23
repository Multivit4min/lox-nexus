import { ForceRequestSchema, InjectRequestSchema, RecentQuerySchema, type ForceDto } from "@lox-nexus/api"
import type { EventBus, Recorder } from "@lox-nexus/core"
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { z } from "zod"
import { HttpError } from "../HttpError.ts"
import type { Controller } from "../Controller.ts"

type InspectorBus = Pick<EventBus, "force" | "release" | "publish" | "command" | "activeForces" | "currentMatching">

const TopicQuery = z.object({ topic: z.string().min(1) })
const PatternQuery = z.object({ pattern: z.string().min(1).default("#") })

/**
 * /api/bus: what the Bus Inspector needs besides the live stream. Recent messages and traces,
 * current values, forces (set and release) and one-shot injection. Every action is attributed
 * to the logged-in user.
 */
export class BusController implements Controller {
  constructor(private readonly bus: InspectorBus, private readonly recorder: Pick<Recorder, "recent" | "trace" | "get">) {}

  register(app: FastifyInstance) {
    app.get("/api/bus/messages", request => {
      const { limit, pattern } = RecentQuerySchema.parse(request.query)
      return BusController.guard(() => this.recorder.recent(limit, pattern))
    })
    app.get("/api/bus/messages/:id/trace", request => {
      const { id } = z.object({ id: z.string() }).parse(request.params)
      if (!this.recorder.get(id)) throw HttpError.notFound(`message "${id}"`)
      return this.recorder.trace(id)
    })
    app.get("/api/bus/current", request => BusController.guard(() => this.bus.currentMatching(PatternQuery.parse(request.query).pattern)))
    app.get("/api/bus/forces", (): ForceDto[] => this.bus.activeForces())
    app.post("/api/bus/forces", (request, reply) => this.force(request, reply))
    app.delete("/api/bus/forces", (request, reply) => this.release(request, reply))
    app.post("/api/bus/inject", (request, reply) => this.inject(request, reply))
  }

  private force(request: FastifyRequest, reply: FastifyReply) {
    const { topic, value, reason, until } = ForceRequestSchema.parse(request.body)
    const by = request.user!.username
    BusController.guard(() => this.bus.force(topic, value, { by, ...(reason ? { reason } : {}), ...(until ? { until } : {}) }))
    return reply.code(204).send()
  }

  private release(request: FastifyRequest, reply: FastifyReply) {
    const { topic } = TopicQuery.parse(request.query)
    if (!this.bus.activeForces().some(force => force.topic === topic)) throw HttpError.notFound(`force on "${topic}"`)
    this.bus.release(topic, request.user!.username)
    return reply.code(204).send()
  }

  private inject(request: FastifyRequest, reply: FastifyReply) {
    const { topic, value, kind } = InjectRequestSchema.parse(request.body)
    const options = { source: { kind: "user" as const, id: request.user!.username }, flags: { injected: true as const } }
    BusController.guard(() => (kind === "command" ? this.bus.command(topic, value, options) : this.bus.publish(topic, value, options)))
    return reply.code(204).send()
  }

  // invalid topics, patterns and expiries throw RangeError in the bus: those are bad requests
  private static guard<T>(work: () => T): T {
    try {
      return work()
    } catch (error) {
      if (error instanceof RangeError) throw HttpError.badRequest(error.message)
      throw error
    }
  }
}
