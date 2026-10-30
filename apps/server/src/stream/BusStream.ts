import { StreamCloseCode } from "@lox-nexus/api"
import { Disposable } from "@lox-nexus/plugin-sdk"
import type { FastifyInstance, FastifyRequest } from "fastify"
import type { WebSocket } from "ws"
import type { AuthService } from "../auth/AuthService.ts"
import { SessionService } from "../auth/SessionService.ts"
import type { Controller } from "../http/Controller.ts"
import type { SessionCookie } from "../http/SessionCookie.ts"
import { StreamClient, type SignalStatusSource, type StreamBus } from "./StreamClient.ts"

/**
 * The /api/stream WebSocket: one multiplexed connection per browser tab. AuthGuard checks the
 * session (and the Origin, against cross-site WebSocket hijacking) on the upgrade; afterwards the
 * connection is closed with SESSION_ENDED as soon as its session is revoked (logout, password
 * change) and, checked every minute, when it expires. Without this a stolen-then-revoked session
 * would keep receiving every bus message until the tab closed.
 *
 * Owns its clients: disposing closes and disposes all of them. HTTP statuses: 401/403 from
 * AuthGuard before the upgrade completes; no other error responses.
 */
export class BusStream extends Disposable implements Controller {
  /** how often live connections are re-checked for expiry; revocation does not wait for this */
  static readonly SESSION_CHECK_MS = 60_000
  private readonly clients = new Set<StreamClient>()

  /** @param sessions only its "revoked" event is used */
  constructor(
    private readonly bus: StreamBus,
    private readonly auth: Pick<AuthService, "isValid">,
    sessions: SessionService,
    private readonly cookie: SessionCookie,
    private readonly status?: SignalStatusSource
  ) {
    super()
    this.listen(sessions, "revoked", (which: { tokenHash: string } | { userId: string }) =>
      this.closeWhere(({ session }) => ("tokenHash" in which ? session.tokenHash === which.tokenHash : session.userId === which.userId)))
    this.every(BusStream.SESSION_CHECK_MS, () => this.closeWhere(({ session }) => !this.auth.isValid(session.token)))
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

  /** adds the route and a preClose hook: Fastify waits for open sockets on close, so they are closed first */
  register(app: FastifyInstance) {
    app.get("/api/stream", { websocket: true }, (socket, request) => this.connect(socket, request))
    // a defined code lets the UI tell a shutdown from a network drop
    app.addHook("preClose", async () => this.closeWhere(() => true, StreamCloseCode.SHUTDOWN, "server shutting down"))
  }

  // defensive: AuthGuard has already rejected unauthenticated upgrades, so this only triggers on a race with dispose
  private connect(socket: WebSocket, request: FastifyRequest) {
    const token = this.cookie.read(request)
    if (this.isDisposed || !token || !request.user) return socket.close(StreamCloseCode.SESSION_ENDED, "login required")
    const client = new StreamClient(socket, this.bus, { token, tokenHash: SessionService.hash(token), userId: request.user.id }, this.status)
    this.clients.add(client)
    socket.once("close", () => {
      this.clients.delete(client)
      void client.dispose()
    })
  }

  // clients remove themselves from the set on the socket's close event, not here
  private closeWhere(predicate: (client: StreamClient) => boolean, code: number = StreamCloseCode.SESSION_ENDED, reason = "session ended") {
    for (const client of this.clients) if (predicate(client)) client.close(code, reason)
  }
}
