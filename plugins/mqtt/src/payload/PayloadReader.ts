import { JsonPath } from "./JsonPath.ts"

/** what a reader found in a payload: the raw value, or why there is none */
export type Read = { ok: true; raw: unknown } | { ok: false; problem: string }

/**
 * Takes the raw value out of a message: the payload as text, or a value at a path in a JSON
 * payload. Payloads over MAX_BYTES are refused rather than parsed.
 */
export class PayloadReader {
  static readonly MAX_BYTES = 256 * 1024
  private readonly path: JsonPath | undefined

  constructor(json: boolean, path = "") {
    this.path = json ? JsonPath.parse(path) : undefined
  }

  /** e.g. `JSON state.temperature`, `JSON`, `text` */
  get summary() {
    if (!this.path) return "text"
    return this.path.text ? `JSON ${this.path.text}` : "JSON"
  }

  read(payload: Buffer): Read {
    if (payload.length > PayloadReader.MAX_BYTES) return { ok: false, problem: `the payload is larger than ${PayloadReader.MAX_BYTES / 1024} KiB` }
    const text = payload.toString("utf8")
    if (!this.path) return { ok: true, raw: text }
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      return { ok: false, problem: text.trim() === "" ? "the payload is empty, expected JSON" : "the payload is not valid JSON" }
    }
    const resolved = this.path.resolve(data)
    return resolved.found ? { ok: true, raw: resolved.value } : { ok: false, problem: `JSON path "${this.path.text}" not found` }
  }
}
