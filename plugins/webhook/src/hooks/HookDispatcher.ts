import type { HttpRequest, HttpResponse } from "@lox-nexus/plugin-sdk"
import type { AuthWarnings } from "../auth/AuthWarnings.ts"
import type { TokenGuard } from "../auth/TokenGuard.ts"
import { WebhookCall } from "../call/WebhookCall.ts"
import type { CallStats } from "./CallStats.ts"
import { HookMethods } from "./HookMethod.ts"
import { HookName } from "./HookName.ts"
import type { HookRegistry } from "./HookRegistry.ts"

const text = { "content-type": "text/plain; charset=utf-8" }

/**
 * Answers a call below the instance: token first (401), then the hook (404), the method (405),
 * and finally every matching signal handles it (204, or 400 with the reasons the values couldn't
 * be read; triggers on the same call fire anyway).
 *
 * The token is checked before the hook is looked up for the answer, so a caller without the token
 * can't tell which hook names exist. The lookup only decides whose counter to raise.
 */
export class HookDispatcher {
  constructor(
    private readonly hooks: HookRegistry,
    private readonly guard: TokenGuard,
    private readonly stats: CallStats,
    private readonly warnings: AuthWarnings,
    private readonly debug: (message: string, data?: unknown) => void = () => {}
  ) {}

  // the hook, method and outcome only: query, headers and body may carry the token or private data;
  // a 400's problems may quote a refused value, as the panel does
  handle(request: HttpRequest): HttpResponse {
    const response = this.answer(request)
    const hook = HookName.fromPath(request.path) ?? "(no hook)"
    const problems = response.status === 400 ? { problems: response.body?.trim() } : undefined
    this.debug(`${request.method} ${hook}: ${response.status}`, problems)
    return response
  }

  private answer(request: HttpRequest): HttpResponse {
    const name = HookName.fromPath(request.path)
    const known = name !== undefined && this.hooks.has(name) ? name : undefined
    const token = this.guard.check(request)
    if (token !== "ok") {
      // only the instance-wide count: a caller without the token must not change a hook's row
      this.stats.rejected(token)
      this.warnings.note(token, known !== undefined)
      return { status: 401, headers: { ...text, "www-authenticate": "Bearer" }, body: "unauthorized\n" }
    }
    if (!known) {
      this.stats.rejected("unknown")
      return { status: 404, headers: text, body: "no such hook\n" }
    }
    return this.dispatch(known, new WebhookCall(request))
  }

  private dispatch(name: string, call: WebhookCall): HttpResponse {
    const handlers = this.hooks.handlers(name)
    const accepting = handlers.filter(handler => HookMethods.accepts(handler.method, call.method))
    if (accepting.length === 0) {
      this.stats.record(name, `method ${call.method} not allowed`)
      const allow = [...new Set(handlers.map(handler => handler.method))].sort().join(", ")
      return { status: 405, headers: { ...text, allow }, body: "method not allowed\n" }
    }
    const problems = accepting.map(handler => handler.handle(call)).filter(problem => problem !== undefined)
    const unique = [...new Set(problems)]
    if (unique.length === 0) {
      this.stats.record(name, "ok")
      return { status: 204 }
    }
    this.stats.record(name, `bad request: ${unique.join("; ")}`)
    return { status: 400, headers: text, body: `${unique.join("\n")}\n` }
  }
}
