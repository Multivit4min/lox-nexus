import { isIP } from "node:net"

/**
 * Where the console's Network Integration API is. The user types an IP address, a host name or a
 * URL; without a path the API's documented local base `/proxy/network/integration` is used (the
 * spec's "Local Console" server). Only https: the API key travels in a header.
 */
export class ConsoleAddress {
  static readonly DEFAULT_BASE_PATH = "/proxy/network/integration"

  private constructor(readonly host: string, readonly port: number, readonly basePath: string) {}

  /** @throws Error with a message for the config form */
  static parse(text: string) {
    const trimmed = text.trim()
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    let url: URL
    try {
      url = new URL(withScheme)
    } catch {
      throw new Error(`"${trimmed}" is no host name, IP address or URL`)
    }
    if (url.protocol !== "https:") throw new Error("the console is reached over https only, so the API key isn't sent in clear text")
    if (url.username || url.password) throw new Error("put the API key in its own field, not in the address")
    const path = url.pathname.replace(/\/+$/, "")
    const host = url.hostname.replace(/^\[(.*)\]$/, "$1")
    return new ConsoleAddress(host, url.port ? Number(url.port) : 443, path || ConsoleAddress.DEFAULT_BASE_PATH)
  }

  /** whether `text` parses; for the config schema's refinement */
  static check(text: string) {
    try {
      ConsoleAddress.parse(text)
      return true
    } catch {
      return false
    }
  }

  /** the TLS server name to send (SNI); none for an IP address, which SNI doesn't allow */
  get serverName() {
    return isIP(this.host) ? undefined : this.host
  }

  /** e.g. https://192.168.1.1, for the panel and messages */
  get origin() {
    const host = isIP(this.host) === 6 ? `[${this.host}]` : this.host
    return `https://${host}${this.port === 443 ? "" : `:${this.port}`}`
  }

  /** the URL of an API path such as "/v1/info" */
  url(path: string, query: Record<string, string> = {}) {
    const url = new URL(`${this.origin}${this.basePath}${path}`)
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
    return url
  }
}
