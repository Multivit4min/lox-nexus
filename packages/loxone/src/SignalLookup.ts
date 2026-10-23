import type { LoxoneSignalEntry } from "./LoxoneSignals.ts"

/** How the routers find configured signals; implemented by LoxoneSignals. */
export interface SignalLookup {
  /** the in-signal for a packet id the Miniserver sent */
  inputFor(packetId: string): LoxoneSignalEntry | undefined
  /** the out-signal behind a bus topic */
  outputFor(topic: string): LoxoneSignalEntry | undefined
  /** every out-signal, to send current values when a connection opens */
  outputs(): LoxoneSignalEntry[]
}
