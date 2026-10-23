import type { Router } from "vue-router"

/**
 * After a new build is deployed, a page loaded earlier still refers to the old, now deleted chunk
 * files, so opening another screen fails and the page stays blank. When that happens, reload once
 * to pick up the new build. A timestamp in sessionStorage stops reload loops if the chunk is
 * really missing.
 */
export class StaleBuildReload {
  private static readonly KEY = "lox-nexus:stale-build-reload"
  private static readonly MIN_INTERVAL_MS = 10_000

  static install(router: Router) {
    // Vite's signal for a failed preload of a dynamic import
    window.addEventListener("vite:preloadError", event => {
      if (StaleBuildReload.reload()) event.preventDefault()
    })
    router.onError((error: unknown) => {
      if (StaleBuildReload.isChunkError(error)) StaleBuildReload.reload()
    })
  }

  private static isChunkError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message)
  }

  /** @returns false when a reload happened moments ago (then the error is real, not a stale build) */
  private static reload() {
    try {
      const last = Number(sessionStorage.getItem(StaleBuildReload.KEY) ?? 0)
      if (Date.now() - last < StaleBuildReload.MIN_INTERVAL_MS) return false
      sessionStorage.setItem(StaleBuildReload.KEY, String(Date.now()))
    } catch {
      // storage blocked: reload anyway, the browser's own loop protection is the fallback
    }
    window.location.reload()
    return true
  }
}
