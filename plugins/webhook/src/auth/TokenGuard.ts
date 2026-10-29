import { createHash, timingSafeEqual } from "node:crypto"
import type { HttpRequest } from "@lox-nexus/plugin-sdk"

/** ok, no token at all, or only tokens that don't match */
export type TokenCheck = "ok" | "missing" | "wrong"

/**
 * Checks the instance token of a call. It is accepted as `Authorization: Bearer <token>`, as an
 * `X-Webhook-Token` header or as a `token` query parameter, because many devices can't set headers.
 * Without a configured token every call is "ok" (the plugin warns about that).
 *
 * Both sides are hashed with sha256 before `timingSafeEqual`, so the comparison takes the same time
 * whatever the guess and its length; comparing the raw strings would leak the token's length
 * (timingSafeEqual needs equal lengths) and `===` how many leading characters were right.
 */
export class TokenGuard {
  private static readonly bearer = /^Bearer[ \t]+(\S+)[ \t]*$/i
  private readonly expected: Buffer | undefined

  constructor(token: string | undefined) {
    this.expected = token === undefined ? undefined : TokenGuard.digest(token)
  }

  check(request: HttpRequest): TokenCheck {
    const expected = this.expected
    if (!expected) return "ok"
    const given = TokenGuard.presented(request)
    if (given.length === 0) return "missing"
    // every candidate is compared, so the time doesn't depend on which transport carried the right one
    const matches = given.map(token => timingSafeEqual(TokenGuard.digest(token), expected))
    return matches.includes(true) ? "ok" : "wrong"
  }

  /** the non-empty tokens a request carries, in any of the three places */
  static presented(request: HttpRequest): string[] {
    const bearer = TokenGuard.bearer.exec(request.headers.authorization ?? "")?.[1]
    const header = request.headers["x-webhook-token"]?.trim()
    const query = Object.hasOwn(request.query, "token") ? request.query.token : undefined
    return [bearer, header, query].filter((token): token is string => token !== undefined && token !== "")
  }

  private static digest(token: string) {
    return createHash("sha256").update(token, "utf8").digest()
  }
}
