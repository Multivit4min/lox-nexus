import type { ValueType } from "@lox-nexus/plugin-sdk/values"
import type { Discovered, LogLevel, PanelPart, PluginDescription } from "@lox-nexus/plugin-sdk/wire"
import { z } from "zod"
import { SignalDisplayInputSchema, type SignalDisplayDto } from "./signalDisplay.ts"

/** one topic segment: lowercase so topics are case-stable */
const segment = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/, "lowercase letters, digits, '.', '_' or '-'")

/** A plugin that can be instantiated. */
export interface PluginPackageDto {
  /** topic segment, e.g. "fronius" */
  id: string
  name: string
  icon?: string
  version: string
  /**
   * development: loaded from the workspace's plugins/ (restarts on file changes); installed:
   * through the installer (see InstalledPluginDto)
   */
  source: "development" | "installed"
  /** config schema and the sensors and actuators it offers, as JSON Schema */
  description: PluginDescription
}

/** stopped … stopping as in the supervisor; unavailable: the plugin isn't installed (any more) */
export type PluginStateDto = "stopped" | "starting" | "running" | "degraded" | "error" | "crashed" | "stopping" | "unavailable"

/** POST/PUT body of a plugin instance. The plugin validates the config when it starts. */
export const PluginInstanceInputSchema = z.object({
  /** PluginPackageDto.id; can't change on update */
  plugin: z.string().min(1),
  slug: segment,
  label: z.string().max(100),
  /** secret fields (`writeOnly` in the schema) may be omitted on update to keep the stored value */
  config: z.record(z.string(), z.unknown()).default({}),
  enabled: z.boolean().default(true)
})
export type PluginInstanceInput = z.input<typeof PluginInstanceInputSchema>

/**
 * POST /api/plugin-instances/check: checks settings before they are saved, and with `test` runs
 * the plugin's Test connection. For an edit, `instanceId` fills in the secrets the form left out.
 */
export const PluginCheckInputSchema = z.object({
  plugin: z.string().min(1),
  config: z.record(z.string(), z.unknown()).default({}),
  instanceId: z.string().min(1).optional(),
  test: z.boolean().default(false)
})
export type PluginCheckInput = z.input<typeof PluginCheckInputSchema>

/** What a settings check found; `checked` is false for a plugin version that can't check before starting. */
export interface PluginCheckDto {
  checked: boolean
  /** problems at their fields; the path starts inside the config */
  issues: Array<{ path: Array<string | number>; message: string }>
  /** with `test`, when the settings are fine: the plugin's message, or why it couldn't connect */
  test?: { ok: true; message?: string } | { ok: false; error: string }
}

/** A plugin instance; secret config fields are never sent back. */
export interface PluginInstanceDto {
  id: string
  plugin: string
  slug: string
  label: string
  config: Record<string, unknown>
  enabled: boolean
  state: PluginStateDto
  /** why it last refused to start or crashed */
  lastError?: string
  /** what the plugin says is wrong while it reports itself degraded */
  statusMessage?: string
  /** automatic restarts after crashes since it was last started or stopped by hand */
  restarts: number
  /** secret config fields that have a stored value (the values are never sent) */
  secrets: string[]
}

/** GET /api/plugin-instances/:id/logs: one of the instance's recent log lines (kept in memory: 200, 1000 while debug logging is on). */
export interface PluginLogLineDto {
  /** epoch ms */
  ts: number
  level: LogLevel
  /** cut at 2000 characters */
  message: string
  /** the logged data as JSON, cut at 2000 characters */
  data?: string
}

/** GET/PUT /api/plugin-instances/:id/log-level: which lines the instance keeps; debug only for a while. */
export interface PluginLogLevelDto {
  level: "debug" | "info"
  /** epoch ms when debug logging switches off by itself */
  until?: number
  /** how long until then, for a countdown that doesn't depend on the browser's clock */
  remainingMs?: number
}

/** Body of PUT /api/plugin-instances/:id/log-level; debug lasts `minutes` (default 15), info ends it at once. */
export const PluginLogLevelInputSchema = z.object({ level: z.enum(["debug", "info"]), minutes: z.int().min(1).max(60).optional() })
export type PluginLogLevelInput = z.infer<typeof PluginLogLevelInputSchema>

/**
 * Body of POST /api/plugin-instances/:id/actions/:action: the form's values, checked by the plugin.
 * `runId` (chosen by the page) tags the action's progress on the stream (`plugin-action-progress`).
 */
export const PluginActionRequestSchema = z.object({
  input: z.record(z.string(), z.unknown()).default({}),
  runId: z.string().min(1).max(64).regex(/^[\w-]+$/).optional()
})
export type PluginActionRequest = z.input<typeof PluginActionRequestSchema>

/** The answer to an action: what the plugin says happened, if anything, and a part to show under it (a QR code). */
export interface PluginActionResultDto {
  message?: string
  panel?: PanelPart
}

/** Body of POST /api/plugins/:plugin/discover: a config field marked discoverable, and the form as filled in so far. */
export const PluginDiscoverInputSchema = z.object({ field: z.string().min(1).max(100), config: z.record(z.string(), z.unknown()).default({}) })
export type PluginDiscoverInput = z.input<typeof PluginDiscoverInputSchema>

/** What Find on the network found for a field. */
export interface PluginDiscoverResultDto {
  found: Discovered
}

/** POST/PUT body of a plugin signal; `slug` defaults to one derived from the label. */
export const PluginSignalInputSchema = z.object({
  kind: z.enum(["sensor", "actuator"]),
  /** the capability id from the description */
  capability: z.string().min(1),
  params: z.unknown().default({}),
  label: z.string().max(100),
  slug: segment.optional(),
  ...SignalDisplayInputSchema.shape
})
export type PluginSignalInput = z.input<typeof PluginSignalInputSchema>

/** A configured sensor or actuator; `error` is why the plugin refused it, if it did. */
export interface PluginSignalDto extends SignalDisplayDto {
  id: string
  instanceId: string
  kind: "sensor" | "actuator"
  capability: string
  params: unknown
  label: string
  slug: string
  topic: string
  valueType: ValueType | "any"
  error?: string
  /**
   * the plugin's active version no longer offers this capability: the signal keeps its topic, wires
   * and last value, `error` says why, and it works again after a rollback
   */
  orphaned?: boolean
}
