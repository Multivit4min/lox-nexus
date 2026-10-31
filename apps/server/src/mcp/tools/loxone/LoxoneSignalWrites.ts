import type { AdoptPacket, LoxoneSignalDto, LoxoneSignalInput } from "@lox-nexus/api"

/** what the changing Loxone tools call: LoxoneSignalService, as the REST controller does */
export interface LoxoneSignalWrites {
  list(miniserverId: string): LoxoneSignalDto[]
  add(miniserverId: string, input: LoxoneSignalInput): LoxoneSignalDto
  update(miniserverId: string, signalId: string, input: LoxoneSignalInput, by: string): LoxoneSignalDto
  remove(miniserverId: string, signalId: string, by: string): void
  adopt(miniserverId: string, input: AdoptPacket, by: string): LoxoneSignalDto
}

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
