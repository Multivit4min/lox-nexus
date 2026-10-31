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
      return [{ label: server.txt.location_name || server.name.split(".")[0] || server.host, value: url, detail: `${version} · ${url}` }]
    })
  }

  private static url(server: MdnsService) {
    const announced = [server.txt.internal_url, server.txt.base_url].find(url => url && /^https?:\/\//i.test(url))
    if (announced) return announced.replace(/\/+$/, "")
    // an IPv4 address reads best and works without a working .local resolver
    const address = server.addresses.find(candidate => candidate.includes(".")) ?? server.addresses[0]
    if (!address) return undefined
    return `http://${address.includes(":") ? `[${address}]` : address}:${server.port}`
  }
}
