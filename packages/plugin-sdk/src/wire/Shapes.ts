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
  /** validated against the capability's params schema when the entry is added */
  params: z.unknown(),
  /** suggested name for the signal */
  label: z.string()
})
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>

/**
 * A browsable tree ("Kitchen ▸ Light ▸ brightness") returned by Plugin.catalog(). A node has a
 * label and children, entries, or both; the user picks entries to add them as signals:
 *
 * ```ts
 * [{ label: "Kitchen", children: [{ label: "Light", entries: [
 *   { kind: "sensor", capability: "state", params: { entityId: "light.kitchen" }, label: "Kitchen light" }
 * ] }] }]
 * ```
 */
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

/**
 * A declarative status view a plugin shows on its page, returned by Plugin.panel(); plugins ship
 * no UI code. Three shapes exist (cells are plain strings, so format numbers yourself):
 *
 * ```ts
 * { type: "keyValue", items: [{ label: "Firmware", value: "1.34" }] }
 * { type: "table", columns: ["Meter", "Power"], rows: [["Grid", "412 W"]] }
 * { type: "json", data: { anything: "JSON-serialisable" } }
 * ```
 *
 * Never put secrets in a panel.
 */
export const PanelSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("keyValue"), items: z.array(z.object({ label: z.string(), value: z.string() })) }),
  z.object({ type: z.literal("table"), columns: z.array(z.string()), rows: z.array(z.array(z.string())) }),
  /** shown as a formatted tree; data must be JSON */
  z.object({ type: z.literal("json"), data: z.unknown() })
])
/** A status view: a key-value list, a table or a JSON tree; see PanelSchema for the three shapes. */
export type Panel = z.infer<typeof PanelSchema>

/** What a webhook handler answers (see PluginHttp.route); `body` is utf-8 text, `headers` and `body` default to empty. */
export const HttpResponseSchema = z.object({
  status: z.int().min(100).max(599),
  headers: z.record(z.string(), z.string()).default({}),
  body: z.string().default("")
})
/** the input type: `headers` and `body` may be omitted, the runtime fills them in */
export type HttpResponse = z.input<typeof HttpResponseSchema>
