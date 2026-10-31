/** one item of a bulk change: its topic when it worked, else why not, so the agent fixes only those */
export type ItemResult = { ok: string } | { failed: string; error: string }

/** Runs a bulk change item by item: one refused item doesn't stop the others. */
export class BulkItems {
  static run<T>(items: readonly T[], name: (item: T) => string, work: (item: T) => string): ItemResult[] {
    return items.map(item => {
      try {
        return { ok: work(item) }
      } catch (error) {
        return { failed: name(item), error: error instanceof Error ? error.message : String(error) }
      }
    })
  }
}
