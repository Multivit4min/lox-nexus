import type { HttpHandler, PluginHttp } from "../plugin/PluginContext.ts"
import type { HttpRequest } from "../wire/HostMessages.ts"
import { HttpResponseSchema, type HttpResponse } from "../wire/Shapes.ts"

/** The webhook routes a plugin registered, matched by method and exact path. */
export class RouteTable implements PluginHttp {
  private readonly routes = new Map<string, HttpHandler>()

  /** @throws Error when the same method and path is registered twice */
  route(method: string, path: string, handler: HttpHandler) {
    const key = RouteTable.key(method, path)
    if (this.routes.has(key)) throw new Error(`route ${key} is already registered`)
    this.routes.set(key, handler)
  }

  /** 404 for an unknown route; a throwing handler rejects, which the host answers with 500 */
  async dispatch(request: HttpRequest): Promise<Required<HttpResponse>> {
    const handler = this.routes.get(RouteTable.key(request.method, request.path))
    if (!handler) return { status: 404, headers: {}, body: "not found" }
    return HttpResponseSchema.parse(await handler(request))
  }

  private static key(method: string, path: string) {
    return `${method.toUpperCase()} ${path}`
  }
}
