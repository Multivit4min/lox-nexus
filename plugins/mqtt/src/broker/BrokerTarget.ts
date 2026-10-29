import type { IClientOptions } from "mqtt"

/** The broker URL: as shown in the panel and log, and as MQTT.js connects to it. */
export class BrokerTarget {
  /** scheme, host, port and path, nothing else */
  static describe(url: string) {
    const parsed = URL.parse(url)
    if (!parsed) return "(invalid URL)"
    const path = parsed.pathname === "/" || parsed.pathname === "" ? "" : parsed.pathname
    return `${parsed.protocol}//${parsed.host}${path}`
  }

  /**
   * The URL as MQTT.js options, parsed with the WHATWG parser: given the string, MQTT.js uses
   * the deprecated url.parse(), and Node prints a warning in the server log at every start.
   * Missing ports are MQTT.js's defaults (1883, 8883, 80, 443); WebSocket URLs keep their path.
   */
  static options(url: string): IClientOptions {
    const parsed = new URL(url)
    const protocol = parsed.protocol.slice(0, -1) as "mqtt" | "mqtts" | "ws" | "wss"
    const websocket = protocol === "ws" || protocol === "wss"
    // MQTT.js builds a WebSocket URL from the hostname as it is, so an IPv6 address keeps its brackets there;
    // a TCP connection takes the bare address
    const hostname = websocket ? parsed.hostname : parsed.hostname.replace(/^\[(.*)\]$/, "$1")
    return {
      protocol,
      hostname,
      host: hostname,
      ...parsed.port ? { port: Number(parsed.port) } : {},
      ...websocket ? { path: `${parsed.pathname}${parsed.search}` } : {}
    }
  }
}
