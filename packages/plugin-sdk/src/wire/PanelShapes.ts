import { z } from "zod"

/**
 * How a value reads at a glance: "ok" green, "warn" amber, "error" red, "info" blue, "muted" grey.
 * The UI shows it with a dot and the colour, never by colour alone.
 */
export const ToneSchema = z.enum(["ok", "warn", "error", "info", "muted"])
/**
 * How a value reads at a glance: "ok" green, "warn" amber, "error" red, "info" blue, "muted" grey.
 * The UI shows it with a dot and the colour, never by colour alone.
 *
 * @category Catalog, panel and actions
 */
export type Tone = z.infer<typeof ToneSchema>

/**
 * A panel value: plain text, or text with a tone, and a time the browser counts down to (`until`,
 * "in 12:30"), up from (`since`, "for 3 min", how long a state lasts) or shows as a moment (`at`,
 * "12 s ago", e.g. the last poll) while the page is open, with the exact time on hover; times are
 * epoch ms. A host without the "panel.v2" feature gets the text (a time as an absolute one) instead.
 */
export const CellSchema = z.union([
  z.string(),
  z.object({
    text: z.string().max(1000).optional(),
    tone: ToneSchema.optional(),
    until: z.number().optional(),
    since: z.number().optional(),
    at: z.number().optional()
  })
])
/**
 * A panel value: plain text, or an object with text, a Tone and a time the browser shows live: `until`
 * counts down, `since` counts up, `at` shows a moment ("12 s ago"). Times are epoch ms. A host without
 * the "panel.v2" feature gets the text instead.
 *
 * @category Catalog, panel and actions
 */
export type Cell = z.infer<typeof CellSchema>

/**
 * A button for an action, on a table row, a key-value item or a section's heading; it opens the
 * action's dialog with `input` filled in (its keys must be fields of the action's input schema).
 * `instant`: runs at once without the dialog (after the action's `confirm`, if it has one), for
 * actions whose input the button fills in completely. `switch`: shown as a switch in the state
 * `checked`; flipping it runs the action with `input` at once (after the action's `confirm`, too),
 * so put the new state in `input`.
 */
export const RowActionSchema = z.object({
  action: z.string().min(1).max(100),
  label: z.string().max(100).optional(),
  input: z.record(z.string(), z.unknown()).optional(),
  instant: z.boolean().optional(),
  switch: z.object({ checked: z.boolean() }).optional()
})
/**
 * A button for an action, on a table row, a key-value item or a section's heading; it opens the
 * action's dialog with `input` filled in (its keys must be fields of the action's input schema).
 * `instant` runs it at once, `switch` shows it as a switch in the state `checked`.
 *
 * @category Catalog, panel and actions
 */
export type RowAction = z.infer<typeof RowActionSchema>

/**
 * The id of a catalog node (CatalogNode.id) whose signals a "Signals" button next to a row or item
 * offers to add, e.g. one client's: the user picks from that node's entries instead of searching
 * the whole catalog. Hosts without "panel.v2" get the panel without it.
 */
const CatalogRef = z.string().min(1).max(200)

// a link the UI may open: the web only, or a page of Nexus itself
const href = z.string().max(2000).refine(link => /^https?:\/\//i.test(link) || link.startsWith("#/"), "only http(s) links or Nexus pages (#/…)")

const KeyValuePanel = z.object({
  type: z.literal("keyValue"),
  items: z.array(z.object({ label: z.string(), value: CellSchema, control: RowActionSchema.optional(), catalog: CatalogRef.optional() }))
})
const TablePanel = z.object({
  type: z.literal("table"), columns: z.array(z.string()), rows: z.array(z.array(CellSchema)),
  rowActions: z.array(z.array(RowActionSchema).max(4)).optional(),
  /** per row, the catalog node with that row's signals (see CatalogRef), or null for none */
  rowCatalog: z.array(CatalogRef.nullable()).optional()
})
/** a QR code of `data`, e.g. a Matter pairing payload */
const QrPanel = z.object({ type: z.literal("qr"), data: z.string().min(1).max(1024), caption: z.string().max(200).optional() })
/** shown as a formatted tree; data must be JSON */
const JsonPanel = z.object({ type: z.literal("json"), data: z.unknown() })
/** headline values as big numbers; with `min` and `max` also a bar; `until` counts down instead of a value */
const TilesPanel = z.object({
  type: z.literal("tiles"),
  tiles: z.array(z.object({
    label: z.string().max(100),
    value: z.union([z.number(), z.string().max(100), z.null()]),
    unit: z.string().max(20).optional(),
    decimals: z.int().min(0).max(6).optional(),
    tone: ToneSchema.optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    until: z.number().optional(),
    hint: z.string().max(200).optional()
  })).max(12)
})
/** a box with a message for the user, e.g. "Not paired yet", with an optional link */
const NoticePanel = z.object({
  type: z.literal("notice"),
  tone: ToneSchema,
  title: z.string().max(200).optional(),
  text: z.string().max(2000),
  link: z.object({ label: z.string().max(100), href }).optional()
})

/** One part of a panel; a section holds one of these. */
export const PanelPartSchema = z.discriminatedUnion("type", [KeyValuePanel, TablePanel, JsonPanel, QrPanel, TilesPanel, NoticePanel])
/**
 * A key-value list, a table, a JSON tree, a QR code, tiles or a notice.
 *
 * @category Catalog, panel and actions
 */
export type PanelPart = z.infer<typeof PanelPartSchema>

/**
 * A declarative status view a plugin shows on its page, returned by Plugin.panel(); plugins ship
 * no UI code:
 *
 * ```ts
 * { type: "keyValue", items: [{ label: "Firmware", value: "1.34" }, { label: "Inverter", value: { text: "running", tone: "ok" } }] }
 * { type: "table", columns: ["Meter", "Power"], rows: [["Grid", "412 W"]], rowActions: [[{ action: "reset", label: "Reset" }]] }
 * { type: "tiles", tiles: [{ label: "PV", value: 3200, unit: "W" }, { label: "Battery", value: 82, unit: "%", min: 0, max: 100 }] }
 * { type: "notice", tone: "warn", title: "Not paired yet", text: "Scan the code in the Alexa app" }
 * { type: "qr", data: "MT:Y.K90…", caption: "Scan in the Alexa app" }
 * { type: "json", data: { anything: "JSON-serialisable" } }
 * { type: "sections", sections: [{ title: "Inverter", panel: { type: "keyValue", items } }, { title: "Meters", panel: { type: "table", columns, rows } }] }
 * ```
 *
 * Values are cells: text, or text with a tone and a live countdown (see Cell). Buttons (see
 * RowAction) go on table rows (`rowActions`), key-value items (`control`) and section headings
 * (`actions`). A row or item that stands for something in the catalog (a client, a device) can
 * point at its catalog node (`rowCatalog`, an item's `catalog`) for a "Signals" button that adds
 * its signals directly. Hosts without the "panel.v2" feature get tiles and notices as key-value lists,
 * cells as text and no item controls; the runtime converts them. Answers must be JSON: format
 * BigInt and dates as text. Never put secrets in a panel.
 */
export const PanelSchema = z.discriminatedUnion("type", [
  KeyValuePanel, TablePanel, JsonPanel, QrPanel, TilesPanel, NoticePanel,
  /**
   * titled parts shown one below the other, e.g. facts as key-value pairs above a table. Hosts
   * before this type refuse it, which fails only the panel request.
   */
  z.object({
    type: z.literal("sections"),
    sections: z.array(z.object({ title: z.string(), panel: PanelPartSchema, actions: z.array(RowActionSchema).max(4).optional() })).max(20)
  })
])
/**
 * A status view: one part, or titled sections of parts; see PanelSchema.
 *
 * @category Catalog, panel and actions
 */
export type Panel = z.infer<typeof PanelSchema>

/**
 * What an action answers: a text, or (on hosts with the "action.result" feature) a message with a
 * panel part shown under it, e.g. the QR code of a pairing window. Older hosts get the message.
 */
export const ActionAnswerSchema = z.union([
  z.string().max(2000),
  z.object({ message: z.string().max(2000).optional(), panel: PanelPartSchema.optional() })
])
export type ActionAnswer = z.infer<typeof ActionAnswerSchema>
