/**
 * Reads how many points of a refused batch InfluxDB dropped, when it wrote the rest: an answer
 * (400, or 422 for a field type conflict) with `partial write: … dropped=N`, or InfluxDB 3's JSON
 * `{ "error": "partial write of line protocol occurred", "data": [one entry per failed line] }`.
 * A body cut short (only its start is kept) can't be counted.
 */
export class PartialWrite {
  /** @returns the dropped points, when the body says so and it is fewer than the batch; else undefined */
  static dropped(body: string, points: number): number | undefined {
    const count = PartialWrite.v1(body) ?? PartialWrite.v3(body)
    return count !== undefined && count > 0 && count < points ? count : undefined
  }

  private static v1(body: string) {
    const match = /partial write:[\s\S]*\bdropped=(\d+)/.exec(body)
    return match ? Number(match[1]) : undefined
  }

  private static v3(body: string) {
    if (!body.includes("partial write")) return undefined
    try {
      const parsed = JSON.parse(body) as { data?: unknown }
      return Array.isArray(parsed.data) ? parsed.data.length : undefined
    } catch {
      return undefined
    }
  }
}
