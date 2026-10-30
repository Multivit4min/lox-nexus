import { z } from "zod"
import { LoxoneSignalInputSchema, MiniserverInputSchema } from "./miniservers.ts"
import { PluginInstanceInputSchema, PluginSignalInputSchema } from "./plugins.ts"
import { SelectionModeSchema } from "./selections.ts"

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

/** A selection as exported: rules on the file's signals, Miniservers and plugin instances. */
export const ExportedSelectionSchema = z.object({
  mode: SelectionModeSchema,
  rules: z.array(z.object({
    target: z.union([z.strictObject({ signalId: id }), z.strictObject({ miniserverId: id }), z.strictObject({ instanceId: id })]),
    include: z.boolean()
  })).max(20_000)
})

/** A plugin instance's sensor or actuator in an export: its input plus the id that wires refer to, and its topic segment. */
export const ExportedPluginSignalSchema = PluginSignalInputSchema.extend({ id, slug: PluginSignalInputSchema.shape.slug.unwrap() })

/**
 * A plugin instance in an export (version 2): its settings without the secret fields, its signals,
 * and for a watching plugin the signals it watches. Its store (pairings, devices, tokens) is not
 * part of the file; an import keeps the store of an instance with the same id.
 */
export const ExportedPluginSchema = z.object({
  id,
  plugin: z.string().min(1).max(100),
  /** a topic segment, checked like the API's */
  slug: PluginInstanceInputSchema.shape.slug,
  label: z.string().max(100),
  enabled: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()).default({}),
  configVersion: z.int().min(1).optional(),
  signals: z.array(ExportedPluginSignalSchema).max(10_000).default([]),
  watch: ExportedSelectionSchema.optional()
})

/**
 * The plugins' secret settings, `{ instanceId: { field: value } }` as JSON, sealed with a
 * passphrase: AES-256-GCM with a key from scrypt (cost 2^logN), all parts base64.
 */
export const SealedSecretsSchema = z.object({
  // a file must not make the server spend more than an export does (2^17, 128 MiB) much beyond it
  logN: z.int().min(14).max(18),
  salt: z.base64(),
  iv: z.base64(),
  tag: z.base64(),
  data: z.base64()
})

/**
 * GET /api/config/export and the body of POST /api/config/import: the whole configuration of an
 * installation. Ids are kept, so wires still point at their signals after an import. Values,
 * forces, users and passwords are not part of it.
 */
export const ConfigExportSchema = z.object({
  format: z.literal("lox-nexus/config"),
  /** 2 adds plugin instances; an import still reads 1 (then the plugin instances stay as they are) */
  version: z.union([z.literal(1), z.literal(2)]),
  /** ISO timestamp, informational */
  exportedAt: z.string().max(40).optional(),
  miniservers: z.array(ExportedMiniserverSchema).max(100),
  wires: z.array(ExportedWireSchema).max(10_000),
  /** which signals the history records; with older files without it, an import keeps the current rules on the file's ids */
  selections: z.object({ history: ExportedSelectionSchema.optional() }).optional(),
  /** version 2: the plugin instances */
  plugins: z.array(ExportedPluginSchema).max(100).optional(),
  /** version 2, when the export included them: the plugins' secret settings, sealed with a passphrase */
  secrets: SealedSecretsSchema.optional()
})
export type ConfigExport = z.input<typeof ConfigExportSchema>

/** POST /api/config/export: the export with the plugins' secrets sealed with this passphrase */
export const ConfigExportRequestSchema = z.object({ passphrase: z.string().min(12).max(1000) })

/** The body of POST /api/config/import: the file, or the file with the passphrase of its secrets. */
export const ConfigImportRequestSchema = z.union([
  z.object({ file: ConfigExportSchema, passphrase: z.string().min(1).max(1000).optional() }),
  ConfigExportSchema.transform(file => ({ file, passphrase: undefined }))
])
export type ConfigImportRequest = z.input<typeof ConfigImportRequestSchema>

/** POST /api/config/import: what the import created */
export interface ConfigImportResultDto {
  miniservers: number
  signals: number
  wires: number
  /** plugin instances and their sensors and actuators */
  plugins: number
  pluginSignals: number
  /** instances whose secret settings the file didn't bring (exported without them): enter them in the settings */
  missingSecrets: Array<{ id: string; label: string; fields: string[] }>
  /** imported wires that don't run (e.g. a transform from a newer version); listed as inactive */
  inactiveWires: number
  /** ids of Miniservers that kept the password stored for the same id before the import */
  keptPasswords: string[]
}
