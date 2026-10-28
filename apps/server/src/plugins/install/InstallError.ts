import { HttpError } from "../../http/HttpError.ts"

/** Why an install step failed; each reason has one HTTP status. */
export type InstallErrorReason =
  | "invalid-source" | "invalid-package" | "describe-failed" | "not-found" | "busy" | "exists" | "conflict"
  | "in-use" | "unsupported" | "git-failed" | "timeout" | "no-space"

const STATUS: Record<InstallErrorReason, number> = {
  "invalid-source": 400,
  "invalid-package": 400,
  "describe-failed": 400,
  "not-found": 404,
  busy: 409,
  exists: 409,
  conflict: 409,
  "in-use": 409,
  unsupported: 409,
  "git-failed": 502,
  timeout: 504,
  "no-space": 507
}

/** A failed install, activation or uninstall. The message is shown to the user, so it names no server internals. */
export class InstallError extends HttpError {
  // SQLite's primary result code for a full database or disk
  private static readonly SQLITE_FULL = 13

  constructor(readonly reason: InstallErrorReason, message: string) {
    super(STATUS[reason], message)
  }

  /** a full disk anywhere in the flow (files or SQLite) becomes `no-space`; everything else stays as it is */
  static fromFileSystem(error: unknown): unknown {
    const { code, errcode } = (error ?? {}) as { code?: unknown; errcode?: unknown }
    const sqliteFull = typeof errcode === "number" && (errcode & 0xff) === InstallError.SQLITE_FULL
    if (code === "ENOSPC" || code === "EDQUOT" || sqliteFull) return new InstallError("no-space", "the server's disk is full")
    return error
  }
}
