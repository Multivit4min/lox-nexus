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
  decimals: z.int().min(0).max(6).optional().catch(undefined)
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
  confirm: z.string().optional()
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
  actions: z.array(ActionDescriptionSchema).optional()
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
 * A declarative status view a plugin shows on its page, returned by Plugin.panel(); plugins ship
 * no UI code. Five shapes exist (cells are plain strings, so format numbers yourself):
 *
 * ```ts
 * { type: "keyValue", items: [{ label: "Firmware", value: "1.34" }] }
 * { type: "table", columns: ["Meter", "Power"], rows: [["Grid", "412 W"]] }
 * { type: "json", data: { anything: "JSON-serialisable" } }
 * { type: "qr", data: "MT:Y.K90…", caption: "Scan in the Alexa app" }
 * { type: "sections", sections: [{ title: "Inverter", panel: { type: "keyValue", items } }, { title: "Meters", panel: { type: "table", columns, rows } }] }
 * ```
 *
 * A table may offer actions per row (`rowActions`, one list per row), e.g. "Remove" next to each
 * paired controller: the button opens the action's dialog with `input` filled in. Hosts before
 * `qr` refuse a panel with one, which fails only the panel request; they ignore `rowActions`.
 * Answers must be JSON: format BigInt and dates as text. Never put secrets in a panel.
 */
const KeyValuePanel = z.object({ type: z.literal("keyValue"), items: z.array(z.object({ label: z.string(), value: z.string() })) })
/** a button on one table row that opens an action's dialog with `input` filled in; its keys must be fields of the action's `input` schema, others are dropped */
export const RowActionSchema = z.object({ action: z.string().min(1).max(100), label: z.string().max(100).optional(), input: z.record(z.string(), z.unknown()).optional() })
export type RowAction = z.infer<typeof RowActionSchema>
const TablePanel = z.object({
  type: z.literal("table"), columns: z.array(z.string()), rows: z.array(z.array(z.string())),
  rowActions: z.array(z.array(RowActionSchema).max(4)).optional()
})
/** a QR code of `data`, e.g. a Matter pairing payload */
const QrPanel = z.object({ type: z.literal("qr"), data: z.string().min(1).max(1024), caption: z.string().max(200).optional() })
/** shown as a formatted tree; data must be JSON */
const JsonPanel = z.object({ type: z.literal("json"), data: z.unknown() })

/** One part of a panel; a section holds one of these. */
export const PanelPartSchema = z.discriminatedUnion("type", [KeyValuePanel, TablePanel, JsonPanel, QrPanel])
/** A key-value list, a table, a JSON tree or a QR code. */
export type PanelPart = z.infer<typeof PanelPartSchema>

export const PanelSchema = z.discriminatedUnion("type", [
  KeyValuePanel, TablePanel, JsonPanel, QrPanel,
  /**
   * titled parts shown one below the other, e.g. facts as key-value pairs above a table. Hosts
   * before this type refuse it, which fails only the panel request.
   */
  z.object({ type: z.literal("sections"), sections: z.array(z.object({ title: z.string(), panel: PanelPartSchema })).max(20) })
])
/** A status view: a key-value list, a table, a JSON tree, a QR code, or titled sections of those; see PanelSchema. */
export type Panel = z.infer<typeof PanelSchema>

/** What a webhook handler answers (see PluginHttp.route); `body` is utf-8 text, `headers` and `body` default to empty. */
export const HttpResponseSchema = z.object({
  status: z.int().min(100).max(599),
  headers: z.record(z.string(), z.string()).default({}),
  body: z.string().default("")
})
/** the input type: `headers` and `body` may be omitted, the runtime fills them in */
export type HttpResponse = z.input<typeof HttpResponseSchema>
