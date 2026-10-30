/**
 * Why the bridge could not start, in words a user can act on. The usual cause is the UDP port: Home
 * Assistant's Matter Server or Matterbridge on the same host listen on 5540 too.
 */
export class StartFailure extends Error {
  constructor(cause: unknown, port: number) {
    super(StartFailure.explain(cause, port), { cause })
    this.name = "StartFailure"
  }

  private static explain(cause: unknown, port: number) {
    const texts = StartFailure.texts(cause).join("\n")
    // matter.js says "Cannot bind {::}:5540 because port is already in use"
    if (/EADDRINUSE|already in use/.test(texts)) {
      return `UDP port ${port} is in use by another program (another Matter bridge or Home Assistant's Matter Server?); choose another UDP port in the settings`
    }
    if (/EACCES/.test(texts)) return `UDP port ${port} may not be used by Nexus; choose a port above 1024`
    return `the Matter bridge could not start: ${cause instanceof Error ? cause.message : String(cause)}`
  }

  /** codes and messages anywhere in the cause chain (matter.js wraps socket errors) */
  private static texts(error: unknown, depth = 0): string[] {
    if (typeof error !== "object" || error === null || depth > 8) return []
    const { code, cause, errors, message } = error as { code?: unknown; cause?: unknown; errors?: unknown; message?: unknown }
    const own = [code, message].filter((value): value is string => typeof value === "string")
    const nested = [cause, ...(Array.isArray(errors) ? errors : [])].flatMap(inner => StartFailure.texts(inner, depth + 1))
    return [...own, ...nested]
  }
}
