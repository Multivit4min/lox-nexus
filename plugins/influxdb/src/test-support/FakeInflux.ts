import http from "node:http"
import type { AddressInfo } from "node:net"
import { gunzipSync } from "node:zlib"

/** A request as the fake saw it; the body is gunzipped when it was sent compressed. */
export interface RecordedRequest {
  method: string
  path: string
  query: Record<string, string>
  headers: http.IncomingHttpHeaders
  body: string
  /** the body's lines */
  lines: string[]
}

/** What the fake answers: a status with headers and body, a dropped connection, or nothing ever. */
export type FakeAnswer = { status: number; headers?: Record<string, string>; body?: string } | "drop" | "hang"

/**
 * A stand-in for InfluxDB on 127.0.0.1 and a free port. Records every write and answers from a
 * script (`answer(...)`, in order), then 204. Health checks (`GET /health`, `GET /ping`) are
 * recorded apart in `checks` and answered with `health` (default 200), so they don't disturb the
 * write script. Answers like the documented InfluxDB API; nothing here talks to a real server.
 */
export class FakeInflux {
  readonly requests: RecordedRequest[] = []
  readonly checks: RecordedRequest[] = []
  health: FakeAnswer = { status: 200, body: "{\"status\":\"pass\"}" }
  private readonly script: FakeAnswer[] = []

  private constructor(private readonly server: http.Server) {}

  static async start() {
    const fake = new FakeInflux(http.createServer())
    fake.server.on("request", (request, response) => void fake.handle(request, response))
    await new Promise<void>(resolve => fake.server.listen(0, "127.0.0.1", resolve))
    return fake
  }

  get url() {
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`
  }

  /** the next requests get these answers, in order */
  answer(...answers: FakeAnswer[]) {
    this.script.push(...answers)
  }

  /** every line received so far */
  get lines() {
    return this.requests.flatMap(request => request.lines)
  }

  /** waits on real event-loop turns (fake timers don't move sockets) until `count` requests came in */
  async received(count: number, ms = 2000) {
    const start = performance.now()
    while (this.requests.length < count) {
      if (performance.now() - start > ms) throw new Error(`expected ${count} requests, got ${this.requests.length}`)
      await new Promise<void>(resolve => setImmediate(resolve))
    }
    return this.requests[count - 1] as RecordedRequest
  }

  async close() {
    this.server.closeAllConnections()
    await new Promise<void>(resolve => this.server.close(() => resolve()))
  }

  private async handle(request: http.IncomingMessage, response: http.ServerResponse) {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(chunk as Buffer)
    const raw = Buffer.concat(chunks)
    const body = (request.headers["content-encoding"] === "gzip" ? gunzipSync(raw) : raw).toString("utf8")
    const url = new URL(request.url ?? "/", "http://fake")
    const check = request.method === "GET" && /\/(health|ping)$/.test(url.pathname)
    const list = check ? this.checks : this.requests
    list.push({
      method: request.method ?? "",
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: request.headers,
      body,
      lines: body === "" ? [] : body.split("\n")
    })
    const answer = check ? this.health : this.script.shift() ?? { status: 204 }
    if (answer === "hang") return
    if (answer === "drop") return void request.socket.destroy()
    response.writeHead(answer.status, answer.headers)
    response.end(answer.body)
  }
}
