import { Mdns, type Discovered, type MdnsService } from "@lox-nexus/plugin-sdk"

/** asks the network for services of a type; tests pass a fake */
export type Browse = (type: string) => Promise<MdnsService[]>

/**
 * Finds MQTT brokers on the network for the broker URL's Find button: brokers announced as
 * `_mqtt._tcp` (Mosquitto with Avahi, Home Assistant's add-on) and `_secure-mqtt._tcp` (TLS).
 */
export class BrokerFinder {
  constructor(private readonly browse: Browse = type => Mdns.browse(type)) {}

  async find(): Promise<Discovered> {
    const [plain, secure] = await Promise.all([this.browse("_mqtt._tcp.local"), this.browse("_secure-mqtt._tcp.local")])
    return [...plain.map(broker => BrokerFinder.entry(broker, "mqtt")), ...secure.map(broker => BrokerFinder.entry(broker, "mqtts"))]
  }

  private static entry(broker: MdnsService, scheme: "mqtt" | "mqtts") {
    // TLS checks the certificate against the name, so a secure broker keeps its host name; a
    // link-local IPv6 address needs a zone a URL can't carry
    const usable = broker.addresses.filter(candidate => !/^fe80:/i.test(candidate))
    const address = scheme === "mqtts" ? broker.host : usable.find(candidate => candidate.includes(".")) ?? usable[0] ?? broker.host
    const url = `${scheme}://${address.includes(":") ? `[${address}]` : address}:${broker.port}`
    // an instance name may hold dots ("Mosquitto on nas.lan"): only the service type is cut off
    const label = broker.name.replace(/\._(secure-)?mqtt\._tcp\.local\.?$/i, "") || broker.host
    return { label, value: url, detail: `${scheme === "mqtts" ? "TLS · " : ""}${broker.host} · ${url}` }
  }
}
