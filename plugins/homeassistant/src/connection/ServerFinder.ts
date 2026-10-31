import { Mdns, type Discovered, type MdnsService } from "@lox-nexus/plugin-sdk"

/** asks the network for services of a type; tests pass a fake */
export type Browse = (type: string) => Promise<MdnsService[]>

/**
 * Finds Home Assistant servers on the network for the URL field's Find button. Home Assistant
 * announces itself as `_home-assistant._tcp` with its URLs in the TXT record; the internal one is
 * what Nexus should use, then the base URL, then the address the answer came from.
 */
export class ServerFinder {
  constructor(private readonly browse: Browse = type => Mdns.browse(type)) {}

  async find(): Promise<Discovered> {
    const servers = await this.browse("_home-assistant._tcp.local")
    return servers.flatMap(server => {
      const url = ServerFinder.url(server)
      if (!url) return []
      const version = server.txt.version ? `Home Assistant ${server.txt.version}` : "Home Assistant"
      // an instance name may hold dots ("Home on ha.lan"): only the service type is cut off
      const instance = server.name.replace(/\._home-assistant\._tcp\.local\.?$/i, "")
      return [{ label: server.txt.location_name || instance || server.host, value: url, detail: `${version} · ${url}` }]
    })
  }

  private static url(server: MdnsService) {
    const announced = [server.txt.internal_url, server.txt.base_url].find(url => url && /^https?:\/\//i.test(url))
    if (announced) return announced.replace(/\/+$/, "")
    // an IPv4 address reads best and works without a working .local resolver; a link-local IPv6
    // one needs a zone a URL can't carry, so the host name is the better fallback
    const usable = server.addresses.filter(candidate => !/^fe80:/i.test(candidate))
    const address = usable.find(candidate => candidate.includes(".")) ?? usable[0] ?? server.host
    if (!address) return undefined
    return `http://${address.includes(":") ? `[${address}]` : address}:${server.port}`
  }
}
