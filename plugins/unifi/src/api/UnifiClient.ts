import { z } from "@lox-nexus/plugin-sdk"
import type { ConsoleTransport, HttpCall } from "../http/ConsoleTransport.ts"
import { ApiError } from "./ApiError.ts"

// the page envelope every list endpoint shares ("Site overview page", "Client overview page", …)
const pageSchema = z.looseObject({ offset: z.number(), limit: z.number(), count: z.number(), totalCount: z.number(), data: z.array(z.unknown()) })

/**
 * JSON over the transport: checks the status, parses and validates answers, and pages through
 * lists. Every error names what was asked for, so it reads well in a status line.
 */
export class UnifiClient {
  /** the spec's maximum page size for most lists */
  static readonly PAGE_SIZE = 200
  /** a guard against a console that never ends a list: 50 pages of 200 */
  static readonly MAX_PAGES = 50

  constructor(private readonly transport: ConsoleTransport) {}

  /** @throws ApiError for an HTTP error; Error for a network failure or an unexpected answer */
  async call<T>(call: HttpCall, schema: z.ZodType<T>, what: string): Promise<T> {
    const answer = await this.transport.request(call)
    if (answer.status < 200 || answer.status >= 300) throw ApiError.from(answer.status, answer.body, what)
    let json: unknown
    try {
      json = answer.body.trim() === "" ? {} : JSON.parse(answer.body)
    } catch {
      throw new Error(`${what}: the answer isn't JSON`)
    }
    const parsed = schema.safeParse(json)
    if (!parsed.success) throw new Error(`${what}: unexpected answer (${z.prettifyError(parsed.error).replace(/\n/g, " ")})`)
    return parsed.data
  }

  /** every item of a paginated list, page by page */
  async list<T>(path: string, item: z.ZodType<T>, what: string, query: Record<string, string> = {}): Promise<T[]> {
    const items: T[] = []
    for (let page = 0; page < UnifiClient.MAX_PAGES; page++) {
      const offset = items.length
      const answer = await this.call({ method: "GET", path, query: { ...query, offset: String(offset), limit: String(UnifiClient.PAGE_SIZE) } }, pageSchema, what)
      for (const entry of answer.data) items.push(this.item(entry, item, what))
      if (answer.data.length === 0 || items.length >= answer.totalCount) return items
    }
    throw new Error(`${what}: more than ${UnifiClient.MAX_PAGES * UnifiClient.PAGE_SIZE} entries`)
  }

  private item<T>(entry: unknown, schema: z.ZodType<T>, what: string): T {
    const parsed = schema.safeParse(entry)
    if (!parsed.success) throw new Error(`${what}: unexpected entry (${z.prettifyError(parsed.error).replace(/\n/g, " ")})`)
    return parsed.data
  }
}
