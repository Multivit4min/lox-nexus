import { z } from "zod"
import { LoxoneSignalInputSchema, MiniserverInputSchema } from "./miniservers.ts"

const id = z.string().min(1).max(200)

/** A signal in an export: its input plus the id that wires refer to. */
export const ExportedSignalSchema = LoxoneSignalInputSchema.extend({ id })

/** A Miniserver in an export: no password (secrets never leave the server), with its signals. */
export const ExportedMiniserverSchema = MiniserverInputSchema.omit({ password: true }).extend({
  id,
  signals: z.array(ExportedSignalSchema).max(10_000)
})

/** A wire in an export; the server validates the transforms against core's schema. */
export const ExportedWireSchema = z.object({
  id,
  label: z.string().max(200),
  sourceId: id,
  targetId: id,
  transforms: z.array(z.looseObject({ op: z.string() })).max(50).default([]),
  enabled: z.boolean().default(true),
  syncOnStart: z.boolean().default(false)
})

/**
 * GET /api/config/export and the body of POST /api/config/import: the whole configuration of an
 * installation. Ids are kept, so wires still point at their signals after an import. Values,
 * forces, users and passwords are not part of it.
 */
export const ConfigExportSchema = z.object({
  format: z.literal("lox-nexus/config"),
  version: z.literal(1),
  /** ISO timestamp, informational */
  exportedAt: z.string().max(40).optional(),
  miniservers: z.array(ExportedMiniserverSchema).max(100),
  wires: z.array(ExportedWireSchema).max(10_000)
})
export type ConfigExport = z.input<typeof ConfigExportSchema>

/** POST /api/config/import: what the import created */
export interface ConfigImportResultDto {
  miniservers: number
  signals: number
  wires: number
  /** imported wires that don't run (e.g. a transform from a newer version); listed as inactive */
  inactiveWires: number
  /** ids of Miniservers that kept the password stored for the same id before the import */
  keptPasswords: string[]
}
