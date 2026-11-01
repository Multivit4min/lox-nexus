import http from "node:http"
import type { AddressInfo } from "node:net"
import type { PlugStatus } from "../PlugClient.ts"

/**
 * A pretend smart plug with a tiny HTTP API, so the tutorial runs without hardware:
 * `GET /status` reports it, `POST /switch` with `{"on": true}` switches it. Real plugs
 * (Shelly, Tasmota, myStrom) have APIs much like this one.
 */
export class FakePlug {
  name = "Desk lamp"
  on = false
  /** what the lamp draws while on, in W */
  load = 60
  /** kWh used so far */
  energy = 0
  // a client that hangs up mid-request mustn't take the fake (or a test run) down
  private readonly server = http.createServer((request, response) => void this.answer(request, response).catch(() => response.destroy()))

  /** @returns the address to put into the plugin's settings, e.g. http://127.0.0.1:8090 */
  async start(port = 0, host = "127.0.0.1") {
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject)
      this.server.listen(port, host, resolve)
    })
    return this.url
  }

  get url() {
    const { address, port } = this.server.address() as AddressInfo
    return `http://${address}:${port}`
  }

  async stop() {
    this.server.closeAllConnections()
    await new Promise(resolve => this.server.close(resolve))
  }

  status(): PlugStatus {
    return { name: this.name, on: this.on, power: this.on ? this.load : 0, energy: Math.round(this.energy * 1000) / 1000 }
  }

  private async answer(request: http.IncomingMessage, response: http.ServerResponse) {
    if (request.method === "GET" && request.url === "/status") return FakePlug.json(response, 200, this.status())
    if (request.method === "POST" && request.url === "/switch") {
      const body = await FakePlug.body(request)
      if (typeof body?.on !== "boolean") return FakePlug.json(response, 400, { error: "send {\"on\": true} or {\"on\": false}" })
      this.on = body.on
      return FakePlug.json(response, 200, this.status())
    }
    FakePlug.json(response, 404, { error: "not found" })
  }

  private static async body(request: http.IncomingMessage): Promise<{ on?: unknown } | undefined> {
    let text = ""
    for await (const chunk of request) text += String(chunk)
    try {
      return JSON.parse(text) as { on?: unknown }
    } catch {
      return undefined
    }
  }

  private static json(response: http.ServerResponse, status: number, body: unknown) {
    response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body))
  }
}
