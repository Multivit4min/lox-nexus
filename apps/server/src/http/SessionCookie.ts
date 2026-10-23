import type { FastifyReply, FastifyRequest } from "fastify"
import { SessionService } from "../auth/SessionService.ts"

/** The httpOnly, SameSite=Strict session cookie (ADR 0004). Scripts can't read it, other sites can't send it. */
export class SessionCookie {
  static readonly NAME = "nexus_session"

  /** @param secure set when served over https, so the cookie never travels unencrypted */
  constructor(private readonly secure: boolean) {}

  read(request: FastifyRequest): string | undefined {
    return request.cookies[SessionCookie.NAME]
  }

  set(reply: FastifyReply, token: string) {
    reply.setCookie(SessionCookie.NAME, token, {
      httpOnly: true, sameSite: "strict", secure: this.secure, path: "/", maxAge: SessionService.TTL_MS / 1000
    })
  }

  clear(reply: FastifyReply) {
    reply.clearCookie(SessionCookie.NAME, { path: "/" })
  }
}
