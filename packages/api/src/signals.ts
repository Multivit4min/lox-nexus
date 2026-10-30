import type { TransformConfig } from "@lox-nexus/core"
import { ValueSchema, type Value } from "@lox-nexus/plugin-sdk/values"
import { z } from "zod"
import type { BusMessageDto } from "./bus.ts"
import type { SignalDisplayDto } from "./signalDisplay.ts"

/** What a signal belongs to; the UI looks up the Miniserver or plugin instance by id. */
export interface SignalOwnerDto {
  kind: "miniserver" | "plugin"
  id: string
}

/** A registered signal with the value subscribers currently see. */
export interface SignalDto extends SignalDisplayDto {
  id: string
  topic: string
  label: string
  /** source produces values for wires, target consumes them */
  direction: "source" | "target"
  valueType: string
  /** how values reach the target: retained state or one-shot command */
  delivery: "state" | "command"
  /** absent until a value was seen */
  current?: BusMessageDto
  owner?: SignalOwnerDto
}

/**
 * One step of a wire: core's TransformSchema, the one source of the shapes. A type-only import,
 * so nothing of core reaches the browser bundle.
 */
export type SupportedTransformDto = TransformConfig

/**
 * A stored step as the UI gets it. One this version can't run (written by hand, or imported from
 * a newer version) comes as "unsupported" with the stored data, so the UI never reads fields
 * that aren't there.
 */
export type TransformDto = SupportedTransformDto | { op: "unsupported"; raw: unknown }

/** A wire as stored; transforms are validated by the server against core's WireSchema. */
export interface WireDto {
  id: string
  label: string
  sourceId: string
  targetId: string
  transforms: TransformDto[]
  enabled: boolean
  syncOnStart: boolean
  /** false when the stored wire could not be started (e.g. its transforms are invalid) */
  active: boolean
  /** why an inactive wire can't start right now; absent for active wires */
  problem?: string
}

/** Body of POST/PUT /api/wires. */
export type WireInputDto = Omit<WireDto, "id" | "active" | "problem" | "transforms"> & { transforms: SupportedTransformDto[] }

/** POST /api/wires/preview: what the transforms make of `value`; `targetId` adds the conversion to its type. */
export const WirePreviewRequestSchema = z.object({
  value: ValueSchema,
  /** validated by the server against core's TransformSchema */
  transforms: z.array(z.unknown()).max(50),
  targetId: z.string().min(1).optional()
})
export type WirePreviewRequest = z.input<typeof WirePreviewRequestSchema>

/** The answer to a preview: the value after each step, and what the target receives. */
export interface WirePreviewDto {
  steps: Array<{ op: SupportedTransformDto["op"]; value: Value; note?: string }>
  delivered: Value
}
