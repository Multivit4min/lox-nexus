import type { FastifyReply, FastifyRequest } from "fastify"
import { SessionService } from "../auth/SessionService.ts"

/** The httpOnly, SameSite=Strict session cookie (ADR 0004). Scripts can't read it, other sites can't send it. */
export class SessionCookie {
  /** not prefixed with __Host- because that requires Secure, which plain-http setups can't use */
  static readonly NAME = "nexus_session"

  /** @param secure set when served over https, so the cookie never travels unencrypted */
  constructor(private readonly secure: boolean) {}

  /** @returns the raw token, or undefined when the browser sent none */
  read(request: FastifyRequest): string | undefined {
    return request.cookies[SessionCookie.NAME]
  }

  /** (Re)sends the cookie with a fresh Max-Age; also used to slide it along with the session */
  set(reply: FastifyReply, token: string) {
    reply.setCookie(SessionCookie.NAME, token, {
      httpOnly: true, sameSite: "strict", secure: this.secure, path: "/", maxAge: SessionService.TTL_MS / 1000
    })
  }

  /** asks the browser to drop the cookie (attributes must match set(), or some browsers keep it) */
  clear(reply: FastifyReply) {
    reply.clearCookie(SessionCookie.NAME, { path: "/" })
  }
}
