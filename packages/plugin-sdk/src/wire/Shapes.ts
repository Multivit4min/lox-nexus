import { z } from "zod"
import { ValueSchema, ValueTypeSchema } from "../values/ValueSchema.ts"
import { WatchDeclarationSchema } from "./WatchShapes.ts"

/** A JSON Schema document, as produced by zod's toJSONSchema. */
export type JsonSchema = Record<string, unknown>

/** A sensor or actuator a plugin offers, ready to be configured with params. */
export const CapabilityDescriptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** one sentence on what it reads or does; absent when the plugin gives none (and from older SDKs) */
  description: z.string().optional(),
  /** JSON Schema of the params; fields marked secret are `writeOnly` */
  params: z.record(z.string(), z.unknown()),
  /** what a sensor emits or an actuator accepts; "any" means it isn't fixed */
  valueType: z.union([ValueTypeSchema, z.literal("any")]),
  /** suggested for new signals (`static unit`); only for display, so an invalid one is dropped */
  unit: z.string().max(16).optional().catch(undefined),
  /** suggested for new signals (`static decimals`); dropped when invalid */
  decimals: z.int().min(0).max(6).optional().catch(undefined),
  /** suggested for new sensor signals (`static staleAfterMs`, in minutes rounded up); dropped when invalid */
  staleAfterMin: z.int().min(1).max(10_080).optional().catch(undefined)
})
export type CapabilityDescription = z.infer<typeof CapabilityDescriptionSchema>

/** An action a user can start from the instance page (`static actions`). */
export const ActionDescriptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  /** JSON Schema of the form; an empty object schema when the action takes no input */
  input: z.record(z.string(), z.unknown()),
  /** a sentence to confirm before it runs */
  confirm: z.string().optional(),
  /** "panel": no button at the top of the page, only where the panel puts it; older hosts show it at the top */
  placement: z.enum(["toolbar", "panel"]).optional()
})
export type ActionDescription = z.infer<typeof ActionDescriptionSchema>

/** The answer to `describe`: everything a UI needs to configure a plugin without loading it. */
export const PluginDescriptionSchema = z.object({
  config: z.record(z.string(), z.unknown()),
  sensors: z.array(CapabilityDescriptionSchema),
  actuators: z.array(CapabilityDescriptionSchema),
  /** set when the plugin watches signals the user chooses (`static readonly watches`) */
  watches: WatchDeclarationSchema.optional(),
  /** set when the plugin declares `static actions`; older hosts drop it */
  actions: z.array(ActionDescriptionSchema).optional(),
  /** set when the plugin has `static test`: the settings form offers Test connection */
  testable: z.literal(true).optional(),
  /** set when the plugin calls panelChanged() (`static panelUpdates = "push"`): the page asks for the panel when told, and rarely otherwise */
  panelPush: z.literal(true).optional(),
  /** config fields with a Find button (marked with discoverable(), the plugin has `static discover`); older hosts drop it */
  discoverable: z.array(z.string().max(100)).max(50).optional()
})
export type PluginDescription = z.infer<typeof PluginDescriptionSchema>

/** A ready-to-add sensor or actuator in a catalog: the capability with its params filled in. */
export const CatalogEntrySchema = z.object({
  kind: z.enum(["sensor", "actuator"]),
  capability: z.string(),
  /** validated against the capability's params schema when the entry is added */
  params: z.unknown(),
  /** suggested name for the signal */
  label: z.string(),
  /**
   * optional: what the sensor reads (or the device reports for an actuator) right now, shown while
   * browsing. Only informative, so an invalid one is dropped instead of failing the catalog.
   */
  value: ValueSchema.optional().catch(undefined),
  /** optional: the value's unit as the device names it, e.g. "W" or "°C"; dropped when longer than 32 characters */
  unit: z.string().max(32).optional().catch(undefined)
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
 * What `static discover` found for a config field, e.g. Home Assistant servers on the network:
 * `value` is what the field gets when the user picks it, `label` and `detail` what the list shows.
 */
export const DiscoveredSchema = z.array(z.object({
  label: z.string().max(200),
  value: z.string().max(2000),
  detail: z.string().max(500).optional()
})).max(100)
export type Discovered = z.infer<typeof DiscoveredSchema>

// the panel's shapes live in PanelShapes; re-exported here, where they were first
export { ActionAnswerSchema, CellSchema, PanelPartSchema, PanelSchema, RowActionSchema, ToneSchema } from "./PanelShapes.ts"
export type { ActionAnswer, Cell, Panel, PanelPart, RowAction, Tone } from "./PanelShapes.ts"

/** What a webhook handler answers (see PluginHttp.route); `body` is utf-8 text, `headers` and `body` default to empty. */
export const HttpResponseSchema = z.object({
  status: z.int().min(100).max(599),
  headers: z.record(z.string(), z.string()).default({}),
  body: z.string().default("")
})
/** the input type: `headers` and `body` may be omitted, the runtime fills them in */
export type HttpResponse = z.input<typeof HttpResponseSchema>
