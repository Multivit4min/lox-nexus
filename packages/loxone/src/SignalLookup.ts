import type { LoxoneSignalConfig } from "./MiniserverConfig.ts"

/** How the routers find configured signals; implemented by Miniserver. */
export interface SignalLookup {
  /** the in-signal for a packet id the Miniserver sent */
  inputFor(packetId: string): { config: LoxoneSignalConfig; topic: string } | undefined
  /** the out-signal behind a bus topic */
  outputFor(topic: string): LoxoneSignalConfig | undefined
}
