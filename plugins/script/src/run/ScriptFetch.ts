import { Disposable } from "@lox-nexus/plugin-sdk"

/**
 * The script's `fetch`: the global one, with a signal the plugin owns, so stopping the instance
 * aborts every request still in flight. A signal of the script (in `init`, or the `Request`'s
 * own) still works; either one aborts.
 *
 * A request ended by the stop never settles: the script is gone, so none of its `then` or `catch`
 * code may run, and a rejection nobody handles would only log a stop as an error.
 */
export class ScriptFetch extends Disposable {
  private readonly controller = new AbortController()

  constructor(private readonly ScriptPromise: PromiseConstructor) {
    super()
    this.onDispose(() => this.controller.abort(new DOMException("the script was stopped", "AbortError")))
  }

  readonly fetch = (input: unknown, init?: unknown): Promise<Response> =>
    new this.ScriptPromise<Response>((resolve, reject) => {
      fetch(input as string | URL | Request, this.withSignal(input, init)).then(resolve, (error: unknown) => {
        if (!this.isDisposed) reject(error)
      })
    })

  private withSignal(input: unknown, init: unknown): RequestInit {
    const options: RequestInit = typeof init === "object" && init !== null ? { ...init as RequestInit } : {}
    const own = options.signal ?? (input instanceof Request ? input.signal : undefined)
    options.signal = own ? AbortSignal.any([this.controller.signal, own]) : this.controller.signal
    return options
  }
}
