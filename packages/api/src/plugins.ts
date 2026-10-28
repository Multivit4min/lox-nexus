import type { ValueType } from "@lox-nexus/plugin-sdk/values"
import type { LogLevel, PluginDescription } from "@lox-nexus/plugin-sdk/wire"
import { z } from "zod"

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

/** GET /api/plugin-instances/:id/logs: one of the instance's recent log lines (kept in memory, about 200). */
export interface PluginLogLineDto {
  /** epoch ms */
  ts: number
  level: LogLevel
  /** cut at 2000 characters */
  message: string
  /** the logged data as JSON, cut at 2000 characters */
  data?: string
}

/** POST/PUT body of a plugin signal; `slug` defaults to one derived from the label. */
export const PluginSignalInputSchema = z.object({
  kind: z.enum(["sensor", "actuator"]),
  /** the capability id from the description */
  capability: z.string().min(1),
  params: z.unknown().default({}),
  label: z.string().max(100),
  slug: segment.optional()
})
export type PluginSignalInput = z.input<typeof PluginSignalInputSchema>

/** A configured sensor or actuator; `error` is why the plugin refused it, if it did. */
export interface PluginSignalDto {
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
}
