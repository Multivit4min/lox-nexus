import { StreamCloseCode } from "@lox-nexus/api"
import { Disposable } from "@lox-nexus/plugin-sdk"
import type { FastifyInstance, FastifyRequest } from "fastify"
import type { WebSocket } from "ws"
import type { AuthService } from "../auth/AuthService.ts"
import { SessionService } from "../auth/SessionService.ts"
import type { Controller } from "../http/Controller.ts"
import type { SessionCookie } from "../http/SessionCookie.ts"
import { StreamClient, type StreamBus } from "./StreamClient.ts"

/**
 * The /api/stream WebSocket: one multiplexed connection per browser tab. AuthGuard checks the
 * session on the upgrade; afterwards the connection is closed with SESSION_ENDED as soon as its
 * session is revoked (logout, password change) and, checked every minute, when it expires.
 */
export class BusStream extends Disposable implements Controller {
  static readonly SESSION_CHECK_MS = 60_000
  private readonly clients = new Set<StreamClient>()

  constructor(
    private readonly bus: StreamBus,
    private readonly auth: Pick<AuthService, "authenticate">,
    sessions: SessionService,
    private readonly cookie: SessionCookie
  ) {
    super()
    this.listen(sessions, "revoked", (which: { tokenHash: string } | { userId: string }) =>
      this.closeWhere(({ session }) => ("tokenHash" in which ? session.tokenHash === which.tokenHash : session.userId === which.userId)))
    this.every(BusStream.SESSION_CHECK_MS, () => this.closeWhere(({ session }) => !this.auth.authenticate(session.token)))
    this.onDispose(async () => {
      const clients = [...this.clients]
      this.clients.clear()
      await Promise.all(clients.map(client => client.dispose()))
    })
  }

  /** open connections */
  get size() {
    return this.clients.size
  }

  register(app: FastifyInstance) {
    app.get("/api/stream", { websocket: true }, (socket, request) => this.connect(socket, request))
    // a defined code lets the UI tell a shutdown from a network drop
    app.addHook("preClose", async () => this.closeWhere(() => true, StreamCloseCode.SHUTDOWN, "server shutting down"))
  }

  private connect(socket: WebSocket, request: FastifyRequest) {
    const token = this.cookie.read(request)
    if (this.isDisposed || !token || !request.user) return socket.close(StreamCloseCode.SHUTDOWN, "unavailable")
    const client = new StreamClient(socket, this.bus, { token, tokenHash: SessionService.hash(token), userId: request.user.id })
    this.clients.add(client)
    socket.once("close", () => {
      this.clients.delete(client)
      void client.dispose()
    })
  }

  private closeWhere(predicate: (client: StreamClient) => boolean, code: number = StreamCloseCode.SESSION_ENDED, reason = "session ended") {
    for (const client of this.clients) if (predicate(client)) client.close(code, reason)
  }
}
