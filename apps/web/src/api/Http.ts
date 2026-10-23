import { ApiError } from "./ApiError.ts"

/**
 * fetch with JSON in and out. Cookies are same-origin, so nothing else is needed for auth.
 * Paths like "/api/auth" are resolved against the page, not the host root, so the UI also works
 * behind a proxy that serves it under a prefix (code-server's /proxy/<port>/, Home Assistant ingress).
 */
export class Http {
  /** "/api/x" → <page base>/api/x */
  static resolve(path: string) {
    return new URL(path.replace(/^\//, ""), document.baseURI)
  }

  /** called on every 401, so the app can send the user to the login page */
  onUnauthorized: () => void = () => {}

  get<T>(url: string) {
    return this.request<T>("GET", url)
  }

  post<T>(url: string, body?: unknown) {
    return this.request<T>("POST", url, body)
  }

  put<T>(url: string, body: unknown) {
    return this.request<T>("PUT", url, body)
  }

  delete(url: string) {
    return this.request<void>("DELETE", url)
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    // no content-type without a body: Fastify rejects an empty JSON body
    const init: RequestInit = body === undefined
      ? { method }
      : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
    const response = await fetch(Http.resolve(url), init)
    if (response.status === 204) return undefined as T
    const data = await response.json().catch(() => ({})) as { error?: string; issues?: ApiError["issues"] }
    if (response.ok) return data as T
    if (response.status === 401) this.onUnauthorized()
    throw new ApiError(response.status, data.error ?? response.statusText, data.issues)
  }
}
