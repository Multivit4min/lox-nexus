import type { HttpRequest } from "@lox-nexus/plugin-sdk"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { WebhookPlugin } from "../WebhookPlugin.ts"

/** a call as tests write it: the hook name instead of a path, the token added unless given */
export type Call = Partial<HttpRequest> & { hook?: string }

/**
 * Starts WebhookPlugin hosts with a known token and stops them all in cleanup, so a failing
 * assertion leaves no pulse timer behind.
 */
export class WebhookHarness {
  static readonly TOKEN = "0123456789abcdef0123456789abcdef"
  private readonly hosts: PluginTestHost[] = []

  async start(config: Record<string, unknown> = {}) {
    const host = await PluginTestHost.start(WebhookPlugin, { config: { token: WebhookHarness.TOKEN, ...config } })
    this.hosts.push(host)
    return host
  }

  /** calls a hook with the right bearer token unless the call brings its own authorization */
  static call(host: PluginTestHost, { hook = "", headers = {}, ...rest }: Call = {}) {
    const auth: Record<string, string> = "authorization" in headers || "x-webhook-token" in headers || rest.query?.token !== undefined
      ? {}
      : { authorization: `Bearer ${WebhookHarness.TOKEN}` }
    return host.http({ path: `/${hook}`, ...rest, headers: { ...auth, ...headers } })
  }

  async cleanup() {
    await Promise.all(this.hosts.splice(0).map(host => host.stop()))
  }
}
