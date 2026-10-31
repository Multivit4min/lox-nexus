import type { FastifyInstance, FastifyRequest } from "fastify"
import { z } from "zod"
import type { PluginStoreService } from "../../services/PluginStoreService.ts"
import type { Controller } from "../Controller.ts"

const IdParams = z.object({ id: z.string().min(1) })
const KeyParams = IdParams.extend({ key: z.string().min(1).max(200) })

/**
 * What an instance saved with `this.store`. All routes need a session and answer 404 for an
 * unknown instance. Values can be read, not changed; the store is only wiped as a whole.
 *
 * - GET /api/plugin-instances/:id/store: 200 with every key and its size.
 * - GET :id/store/:key: 200 with the value; 404 for an unknown key.
 * - DELETE :id/store: 200 with how many keys went and the instance. A running instance is stopped,
 *   wiped and started again, so it never runs on half of its data.
 */
export class PluginStoreController implements Controller {
  constructor(private readonly store: PluginStoreService) {}

  register(app: FastifyInstance) {
    // reading changes nothing, so a config import doesn't wait for it
    const lockFree = { config: { lockFree: true } }
    app.get("/api/plugin-instances/:id/store", lockFree, request => this.store.entries(IdParams.parse(request.params).id))
    app.get("/api/plugin-instances/:id/store/:key", lockFree, request => {
      const { id, key } = KeyParams.parse(request.params)
      return this.store.value(id, key)
    })
    app.delete("/api/plugin-instances/:id/store", request => this.store.clear(IdParams.parse(request.params).id, PluginStoreController.user(request)))
  }

  private static user(request: FastifyRequest) {
    return request.user!.username
  }
}
