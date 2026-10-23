import type { BusMessageDto } from "./bus.ts"

/** A registered signal with the value subscribers currently see. */
export interface SignalDto {
  id: string
  topic: string
  label: string
  direction: "source" | "target"
  valueType: string
  delivery: "state" | "command"
  current?: BusMessageDto
}

/** A wire as stored; transforms are validated by the server against core's WireSchema. */
export interface WireDto {
  id: string
  label: string
  sourceId: string
  targetId: string
  transforms: Array<{ op: string } & Record<string, unknown>>
  enabled: boolean
  syncOnStart: boolean
  /** false when the stored wire could not be started (e.g. its transforms are invalid) */
  active: boolean
}
