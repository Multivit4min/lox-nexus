import { Disposable } from "@lox-nexus/plugin-sdk"

interface Waiting {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  cancel: () => void
}

/** Thrown when a plugin answers a request with ok: false; the message is the plugin's. */
export class PluginRequestError extends Error {}

/** Matches worker responses to host requests by id, with a timeout per request. */
export class RequestTracker extends Disposable {
  private nextId = 1
  private readonly waiting = new Map<number, Waiting>()

  constructor() {
    super()
    this.onDispose(() => this.failAll("the plugin stopped"))
  }

  /** @returns the id to put on the request and the promise of its result (rejects on timeout) */
  create(timeoutMs: number, what: string): { requestId: number; result: Promise<unknown> } {
    const requestId = this.nextId++
    const result = new Promise<unknown>((resolve, reject) => {
      const cancel = this.after(timeoutMs, () => {
        this.waiting.delete(requestId)
        reject(new Error(`the plugin did not answer ${what} within ${timeoutMs} ms`))
      })
      this.waiting.set(requestId, { resolve, reject, cancel })
    })
    return { requestId, result }
  }

  /** settles the request; responses to unknown (timed out) ids are ignored */
  settle(response: { requestId: number; ok: boolean; result?: unknown; error?: string }) {
    const waiting = this.waiting.get(response.requestId)
    if (!waiting) return
    this.waiting.delete(response.requestId)
    waiting.cancel()
    if (response.ok) waiting.resolve(response.result)
    else waiting.reject(new PluginRequestError(response.error ?? "the plugin refused the request"))
  }

  /** rejects every open request, e.g. when the worker exits */
  failAll(reason: string) {
    for (const waiting of this.waiting.values()) {
      waiting.cancel()
      waiting.reject(new Error(reason))
    }
    this.waiting.clear()
  }
}
