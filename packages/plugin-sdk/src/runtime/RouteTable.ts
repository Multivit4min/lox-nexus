import type { HttpHandler, PluginHttp } from "../plugin/PluginContext.ts"
import type { HttpRequest } from "../wire/HostMessages.ts"
import { HttpResponseSchema, type HttpResponse } from "../wire/Shapes.ts"

/** A route whose path ends in "/*": it matches every path that starts with `prefix` + "/". */
interface PrefixRoute {
  method: string
  /** "" for "/*" */
  prefix: string
  handler: HttpHandler
}

/**
 * The webhook routes a plugin registered. A method of "*" matches any method, and a path ending
 * in "/*" matches every path below that prefix ("/a/*" matches "/a/" and "/a/b", not "/a"). The
 * most specific route wins: an exact path before a prefix, a longer prefix before a shorter one,
 * and a named method before "*". Matching costs one lookup plus one string comparison per prefix
 * route, whatever the length of the path a caller sends.
 */
export class RouteTable implements PluginHttp {
  private readonly exact = new Map<string, HttpHandler>()
  /** longest prefix first, then named methods before "*" */
  private readonly prefixes: PrefixRoute[] = []

  /** @throws Error when the same method and path is registered twice */
  route(method: string, path: string, handler: HttpHandler) {
    const key = RouteTable.key(method, path)
    const upper = method.toUpperCase()
    if (path.endsWith("/*")) {
      const prefix = path.slice(0, -2)
      if (this.prefixes.some(route => route.method === upper && route.prefix === prefix)) throw new Error(`route ${key} is already registered`)
      this.prefixes.push({ method: upper, prefix, handler })
      this.prefixes.sort((a, b) => b.prefix.length - a.prefix.length || Number(a.method === "*") - Number(b.method === "*"))
      return
    }
    if (this.exact.has(key)) throw new Error(`route ${key} is already registered`)
    this.exact.set(key, handler)
  }

  /** 404 for an unknown route; a throwing handler rejects, which the host answers with 502 */
  async dispatch(request: HttpRequest): Promise<Required<HttpResponse>> {
    const handler = this.match(request.method.toUpperCase(), request.path)
    if (!handler) return { status: 404, headers: {}, body: "not found" }
    return HttpResponseSchema.parse(await handler(request))
  }

  private match(method: string, path: string) {
    const exact = this.exact.get(RouteTable.key(method, path)) ?? this.exact.get(RouteTable.key("*", path))
    if (exact) return exact
    return this.prefixes.find(route => (route.method === method || route.method === "*") && path.startsWith(`${route.prefix}/`))?.handler
  }

  private static key(method: string, path: string) {
    return `${method.toUpperCase()} ${path}`
  }
}
