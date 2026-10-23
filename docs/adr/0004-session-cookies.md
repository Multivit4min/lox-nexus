# 0004: Opaque session cookies instead of JWT

## Context
The old project used 5-day JWTs in localStorage, with no revocation, and tokens survived password
changes.

## Decision
Password hashes (scrypt, see ADR 0008), plus opaque random session ids stored in a `sessions` table and sent as
httpOnly, SameSite=Strict cookies. The WebSocket authenticates on upgrade with the same cookie.

## Consequences
- Sessions are revocable (logout, password change, admin action), and no token is readable by
  scripts.
- One DB lookup per request is trivial for this workload.
