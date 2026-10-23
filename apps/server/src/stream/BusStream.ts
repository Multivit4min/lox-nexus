import { Disposable } from "@lox-nexus/plugin-sdk"
import type { FastifyInstance } from "fastify"
import type { WebSocket } from "ws"
import type { Controller } from "../http/Controller.ts"
import { StreamClient, type StreamBus } from "./StreamClient.ts"

/**
 * The /api/stream WebSocket: one multiplexed connection per browser tab. Authentication happens
 * in AuthGuard on the upgrade request (same session cookie as the REST API).
 */
export class BusStream extends Disposable implements Controller {
  private readonly clients = new Set<StreamClient>()

  constructor(private readonly bus: StreamBus) {
    super()
    this.onDispose(async () => {
      const clients = [...this.clients]
      this.clients.clear()
      await Promise.all(clients.map(client => client.dispose()))
    })
  }

  get size() {
    return this.clients.size
  }

  register(app: FastifyInstance) {
    app.get("/api/stream", { websocket: true }, socket => this.connect(socket))
  }

  private connect(socket: WebSocket) {
    if (this.isDisposed) return socket.close(1001, "shutting down")
    const client = new StreamClient(socket, this.bus)
    this.clients.add(client)
    socket.once("close", () => {
      this.clients.delete(client)
      void client.dispose()
    })
  }
}
