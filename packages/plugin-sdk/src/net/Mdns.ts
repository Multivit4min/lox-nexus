import { createSocket } from "node:dgram"
import { type Clock, SystemClock } from "../lifecycle/Clock.ts"
import { DnsPacket, type DnsRecord } from "./DnsPacket.ts"

/** A service found on the network, e.g. a Home Assistant server. */
export interface MdnsService {
  /** the instance's name, e.g. "Home._home-assistant._tcp.local" */
  name: string
  /** the host name it runs on, e.g. "homeassistant.local" */
  host: string
  port: number
  /** the host's IPv4 and IPv6 addresses the answer gave */
  addresses: string[]
  /** its TXT record as key-value pairs, e.g. `{ base_url: "http://10.0.0.5:8123" }` */
  txt: Record<string, string>
}

/** where to ask; tests ask a responder on the loopback interface */
export interface MdnsOptions {
  /** how long answers are collected, in ms; default 3000 */
  timeoutMs?: number
  /** default 224.0.0.251, mDNS's multicast group */
  address?: string
  /** default 5353 */
  port?: number
  /** the timer's clock; tests may pass a TestClock */
  clock?: Clock
}

/**
 * Finds services that announce themselves with multicast DNS (Bonjour, Avahi), for a plugin's
 * `static discover`. It asks once from a random port (a "legacy unicast" query, RFC 6762 §6.7),
 * so it needs neither port 5353 nor a running mDNS daemon, and collects the answers for a few
 * seconds. Nexus must be on the same network as the services (host networking in Docker).
 *
 * ```ts
 * const servers = await Mdns.browse("_home-assistant._tcp.local")
 * ```
 */
export class Mdns {
  /**
   * the services of a type, e.g. "_mqtt._tcp.local" ("_mqtt._tcp" gets the ".local"); an empty
   * list when none answered. Rejects when the query can't be sent, e.g. without a route for multicast.
   */
  static async browse(type: string, options: MdnsOptions = {}): Promise<MdnsService[]> {
    const full = /\.local\.?$/i.test(type) ? type : `${type}.local`
    const records = await Mdns.ask(full, options)
    return Mdns.services(full, records)
  }

  private static ask(type: string, options: MdnsOptions): Promise<DnsRecord[]> {
    const clock = options.clock ?? SystemClock.instance
    const records: DnsRecord[] = []
    const socket = createSocket({ type: "udp4", reuseAddr: true })
    return new Promise((resolve, reject) => {
      let timer: unknown
      let settled = false
      // a send error and the timer may both end it; the socket closes once, the timer never fires on a closed one
      const settle = (error?: unknown) => {
        if (settled) return
        settled = true
        clock.clearTimeout(timer)
        socket.close(() => error === undefined ? resolve(records) : reject(error instanceof Error ? error : new Error(String(error))))
      }
      socket.on("error", settle)
      socket.on("message", packet => {
        // one broken or foreign answer doesn't spoil the others
        try {
          records.push(...DnsPacket.records(packet))
        } catch {
          return
        }
      })
      socket.bind(0, () => {
        timer = clock.setTimeout(() => settle(), options.timeoutMs ?? 3000)
        try {
          socket.send(DnsPacket.query(type), options.port ?? 5353, options.address ?? "224.0.0.251", error => {
            if (error) settle(error)
          })
        } catch (error) {
          settle(error)
        }
      })
    })
  }

  // instances of the type with their host, port, TXT entries and addresses; one per instance
  private static services(type: string, records: readonly DnsRecord[]): MdnsService[] {
    const lower = (name: string) => name.toLowerCase()
    const of = <K extends DnsRecord["type"]>(kind: K) => records.filter((record): record is Extract<DnsRecord, { type: K }> => record.type === kind)
    const instances = new Set(of("PTR").filter(record => lower(record.name) === lower(type)).map(record => record.target))
    return [...instances].flatMap(name => {
      const srv = of("SRV").find(record => lower(record.name) === lower(name))
      if (!srv) return []
      const txt = of("TXT").find(record => lower(record.name) === lower(name))?.entries
      // a plain object for the plugin; spreading copies even a "__proto__" key as data
      const txtEntries = { ...txt }
      const addresses = records.flatMap(record => (record.type === "A" || record.type === "AAAA") && lower(record.name) === lower(srv.target) ? [record.address] : [])
      return [{ name, host: srv.target, port: srv.port, addresses: [...new Set(addresses)], txt: txtEntries }]
    })
  }
}
