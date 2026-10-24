import { z } from "zod"
import { ValueTypeSchema } from "../values/ValueSchema.ts"

/** A JSON Schema document, as produced by zod's toJSONSchema. */
export type JsonSchema = Record<string, unknown>

/** A sensor or actuator a plugin offers, ready to be configured with params. */
export const CapabilityDescriptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** JSON Schema of the params; fields marked secret are `writeOnly` */
  params: z.record(z.string(), z.unknown()),
  /** what a sensor emits or an actuator accepts; "any" means it isn't fixed */
  valueType: z.union([ValueTypeSchema, z.literal("any")])
})
export type CapabilityDescription = z.infer<typeof CapabilityDescriptionSchema>

/** The answer to `describe`: everything a UI needs to configure a plugin without loading it. */
export const PluginDescriptionSchema = z.object({
  config: z.record(z.string(), z.unknown()),
  sensors: z.array(CapabilityDescriptionSchema),
  actuators: z.array(CapabilityDescriptionSchema)
})
export type PluginDescription = z.infer<typeof PluginDescriptionSchema>

/** A ready-to-add sensor or actuator in a catalog: the capability with its params filled in. */
export const CatalogEntrySchema = z.object({
  kind: z.enum(["sensor", "actuator"]),
  capability: z.string(),
  params: z.unknown(),
  /** suggested name for the signal */
  label: z.string()
})
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>

/** A browsable tree ("Kitchen ▸ Light ▸ brightness"); leaves carry entries. */
export interface CatalogNode {
  label: string
  children?: CatalogNode[]
  entries?: CatalogEntry[]
}
export const CatalogNodeSchema: z.ZodType<CatalogNode> = z.lazy(() => z.object({
  label: z.string(),
  children: z.array(CatalogNodeSchema).optional(),
  entries: z.array(CatalogEntrySchema).optional()
}))

/** A declarative status view a plugin shows on its page; plugins ship no UI code. */
export const PanelSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("keyValue"), items: z.array(z.object({ label: z.string(), value: z.string() })) }),
  z.object({ type: z.literal("table"), columns: z.array(z.string()), rows: z.array(z.array(z.string())) }),
  z.object({ type: z.literal("json"), data: z.unknown() })
])
export type Panel = z.infer<typeof PanelSchema>

/** What a webhook handler answers; `body` is utf-8 text. */
export const HttpResponseSchema = z.object({
  status: z.int().min(100).max(599),
  headers: z.record(z.string(), z.string()).default({}),
  body: z.string().default("")
})
export type HttpResponse = z.input<typeof HttpResponseSchema>
